import { Test, type TestingModule } from '@nestjs/testing';
import {
	BadRequestException,
	ConflictException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { DASS42_CATALOG } from '../reference-data/catalogs/dass42.catalog';
import { Dass42RuleAssessmentService } from '../rules/conflicts/dass42-rule-assessment.service';
import { compileRule, GRAMMAR_VERSION } from '../rules/rule-grammar';
import {
	inferenceRule,
	inferenceSubmission,
} from '../../../test/dass42-inference-mocks';
import { Dass42InferenceService } from './dass42-inference.service';
import {
	MAX_INFERENCE_RULES,
	ENGINE_VERSION,
	CONFIG_HASH,
} from './dass42-mamdani.config';

function source(): Awaited<
	ReturnType<Dass42RuleAssessmentService['readCurrentConflictFreeSnapshot']>
> {
	return {
		groupId: 1,
		sourceHash: 'f'.repeat(64),
		comparisonVersion: 'homogeneous-ac-v1',
		evaluatedAt: new Date('2026-01-01'),
		rules: (['DEPRESSION', 'ANXIETY', 'STRESS'] as const).map(
			(category, i) => {
				const content = inferenceRule(category);
				return {
					id: i + 1,
					revisionId: `revision-${i}`,
					version: 1,
					authorExpertId: 'synthetic-expert',
					authorUserId: 'synthetic-user',
					grammarVersion: GRAMMAR_VERSION,
					content,
					antecedent: compileRule(content).antecedent,
				};
			},
		),
	};
}
describe('Internal DASS42 inference boundary with mocked dependencies', () => {
	let module: TestingModule;
	let service: Dass42InferenceService;
	let references: jest.Mocked<Pick<ReferenceDataService, 'getQuestionnaire'>>;
	let assessment: jest.Mocked<
		Pick<Dass42RuleAssessmentService, 'readCurrentConflictFreeSnapshot'>
	>;
	const tx = {} as Prisma.TransactionClient;
	let transaction: jest.Mock<
		Promise<unknown>,
		[(db: Prisma.TransactionClient) => Promise<unknown>]
	>;
	beforeEach(async () => {
		const catalog = {
			instrument: 'DASS42' as const,
			catalogVersion: DASS42_CATALOG.catalogVersion,
			questions: DASS42_CATALOG.questions.map(({ id, number, text }) => ({
				id,
				number,
				text,
			})),
		};
		references = {
			getQuestionnaire: jest.fn().mockResolvedValue(catalog),
		};
		assessment = {
			readCurrentConflictFreeSnapshot: jest
				.fn()
				.mockResolvedValue(source()),
		};
		transaction = jest.fn((work) => work(tx));
		module = await Test.createTestingModule({
			providers: [
				Dass42InferenceService,
				{
					provide: PrismaService,
					useValue: { $transaction: transaction },
				},
				{ provide: ReferenceDataService, useValue: references },
				{ provide: Dass42RuleAssessmentService, useValue: assessment },
			],
		}).compile();
		service = module.get(Dass42InferenceService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should preserve original successful result fields without winner/tie/support flags', async () => {
		const result = await service.evaluate(1, inferenceSubmission());
		expect(result).toMatchObject({
			engineVersion: ENGINE_VERSION,
			configHash: CONFIG_HASH,
			groupId: 1,
			sourceHash: 'f'.repeat(64),
		});
		expect(Object.keys(result.result)).toEqual([
			'depression',
			'anxiety',
			'stress',
		]);
		for (const [category, value] of Object.entries(result.result)) {
			expect(Object.keys(value)).toEqual([
				'category',
				'score',
				'membership_degrees',
			]);
			expect(value.category).toBe(category);
			expect(Object.keys(value.membership_degrees)).toEqual([
				'Normal',
				'Mild',
				'Moderate',
				'Severe',
				'Extremely Severe',
			]);
		}
		expect(result.disclaimer).toContain('not a medical diagnosis');
		expect(Object.keys(result)).not.toContain(
			'professionalSupportRecommended',
		);
	});
	it('should preserve fractional input and canonical identities even if request order changes', async () => {
		const input = inferenceSubmission();
		input.answers[0].score = 1.5;
		input.answers.reverse();
		const before = structuredClone(input);
		expect(
			(await service.evaluate(1, input)).result.depression.score,
		).toBeCloseTo(397 / 69, 12);
		expect(input).toEqual(before);
	});
	it('should acquire one consistent read transaction and enforce the reviewed source limit', async () => {
		await service.evaluate(1, inferenceSubmission());
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
			isolationLevel: 'RepeatableRead',
		});
		expect(references.getQuestionnaire).toHaveBeenCalledWith('DASS42', tx);
		expect(assessment.readCurrentConflictFreeSnapshot).toHaveBeenCalledWith(
			1,
			tx,
			MAX_INFERENCE_RULES,
		);
	});
	it('should capture accepted values before an asynchronous source read even if the caller reuses its payload', async () => {
		const input = inferenceSubmission();
		input.answers[0].score = 1.5;
		const catalog = await references.getQuestionnaire('DASS42', tx);
		references.getQuestionnaire.mockImplementation(() => {
			input.answers[0].score = 3;
			input.catalogVersion = 'changed-after-validation';
			return Promise.resolve(catalog);
		});
		expect(
			(await service.evaluate(1, input)).result.depression.score,
		).toBeCloseTo(397 / 69, 12);
	});
	it('should reuse the supplied transaction rather than open an inconsistent nested snapshot', async () => {
		await service.evaluate(1, inferenceSubmission(), tx);
		expect(transaction).not.toHaveBeenCalled();
		expect(assessment.readCurrentConflictFreeSnapshot).toHaveBeenCalledWith(
			1,
			tx,
			MAX_INFERENCE_RULES,
		);
	});
	it('should reject invalid internal input before any storage read', async () => {
		const input = inferenceSubmission();
		input.answers.pop();
		await expect(service.evaluate(1, input)).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(transaction).not.toHaveBeenCalled();
		expect(references.getQuestionnaire).not.toHaveBeenCalled();
	});
	it('should reject a stale request catalog without reading rules', async () => {
		const input = inferenceSubmission();
		input.catalogVersion = 'older-release';
		await expect(service.evaluate(1, input)).rejects.toBeInstanceOf(
			ConflictException,
		);
		expect(
			assessment.readCurrentConflictFreeSnapshot,
		).not.toHaveBeenCalled();
	});
	it.each(['missing-category', 'no-activation'])(
		'should fail the whole result for %s inside its own transaction',
		async (kind) => {
			const snapshot = source();
			if (kind === 'missing-category') snapshot.rules.pop();
			assessment.readCurrentConflictFreeSnapshot.mockResolvedValue(
				snapshot,
			);
			await expect(
				service.evaluate(
					1,
					inferenceSubmission(kind === 'no-activation' ? 3 : 0),
				),
			).rejects.toBeInstanceOf(ConflictException);
		},
	);
	it('should preserve an eligibility/conflict rejection rather than substitute QDSS or an old result', async () => {
		assessment.readCurrentConflictFreeSnapshot.mockRejectedValue(
			new ConflictException(
				'Applicable rules contain unresolved conflicts',
			),
		);
		await expect(
			service.evaluate(1, inferenceSubmission()),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should fail closed on a source returned for another group', async () => {
		assessment.readCurrentConflictFreeSnapshot.mockResolvedValue({
			...source(),
			groupId: 2,
		});
		await expect(
			service.evaluate(1, inferenceSubmission()),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('should reject corrupt numerical source without disclosing source payloads', async () => {
		const snapshot = source();
		Reflect.set(snapshot.rules[0], 'antecedent', ['INVALID']);
		assessment.readCurrentConflictFreeSnapshot.mockResolvedValue(snapshot);
		await expect(
			service.evaluate(1, inferenceSubmission()),
		).rejects.toThrow('DASS42 numerical configuration requires review');
	});
	it.each([false, true])(
		'should sanitize an unknown dependency failure with caller transaction=%s',
		async (supplied) => {
			references.getQuestionnaire.mockRejectedValue(
				new Error('synthetic-private-provider-detail'),
			);
			try {
				await service.evaluate(
					1,
					inferenceSubmission(),
					supplied ? tx : undefined,
				);
				throw new Error('Expected rejection');
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(ServiceUnavailableException);
				expect(
					JSON.stringify(
						(error as ServiceUnavailableException).getResponse(),
					),
				).not.toContain('synthetic-private-provider-detail');
			}
		},
	);
});
