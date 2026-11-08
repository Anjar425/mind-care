import {
	ConflictException,
	HttpException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { Dass42RuleAssessmentService } from '../rules/conflicts/dass42-rule-assessment.service';
import { ruleConflictTx } from '../rules/conflicts/conflict-persistence';
import { assertSubmission } from './dass42-inference.validation';
import {
	CONFIG_HASH,
	ENGINE_VERSION,
	MAX_INFERENCE_RULES,
} from './dass42-mamdani.config';
import { inferMamdani } from './math/mamdani';
import { InferenceCoverageError } from './math/centroid';
import type { SourceResult } from './dass42.types';
import { withTransaction } from '../../infrastructure/prisma/transaction';

@Injectable()
export class Dass42InferenceService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly references: ReferenceDataService,
		private readonly assessment: Dass42RuleAssessmentService,
	) {}
	// Internal compute boundary. Patient HTTP access/history require their own reviewed scope.
	async evaluate(
		groupId: number,
		submission: unknown,
		db?: Prisma.TransactionClient,
	) {
		assertSubmission(groupId, submission);
		// Capture accepted scalar values before any await; callers may reuse their payload object.
		const catalogVersion = submission.catalogVersion;
		const answers = new Map(
			submission.answers.map((a) => [a.dass42Id, a.score]),
		);
		const work = async (tx: Prisma.TransactionClient) => {
			const catalog = await this.references.getQuestionnaire(
				'DASS42',
				tx,
			);
			if (catalog.catalogVersion !== catalogVersion)
				throw new ConflictException(
					'Reload the current DASS42 catalog',
				);
			if (
				catalog.questions.length !== 42 ||
				catalog.questions.some((q) => !answers.has(q.id))
			)
				throw new ServiceUnavailableException(
					'DASS42 catalog identity requires review',
				);
			const source =
				await this.assessment.readCurrentConflictFreeSnapshot(
					groupId,
					tx,
					MAX_INFERENCE_RULES,
				);
			if (source.groupId !== groupId)
				throw new ServiceUnavailableException(
					'DASS42 source scope requires review',
				);
			let result: SourceResult;
			try {
				result = inferMamdani(
					source.rules.map((r) => ({
						antecedent: r.antecedent,
						conclusion: r.content.conclusion,
					})),
					new Map(
						catalog.questions.map((q) => [
							q.id,
							answers.get(q.id)!,
						]),
					),
				);
			} catch (error) {
				if (error instanceof InferenceCoverageError)
					throw new ConflictException(
						'DASS42 rules do not activate every required category for these answers',
					);
				throw new ServiceUnavailableException(
					'DASS42 numerical configuration requires review',
				);
			}
			return {
				engineVersion: ENGINE_VERSION,
				configHash: CONFIG_HASH,
				catalogVersion: catalog.catalogVersion,
				groupId,
				sourceHash: source.sourceHash,
				evaluatedAt: source.evaluatedAt,
				result,
				disclaimer:
					'Screening support only. Fuzzy scores and membership degrees are not a medical diagnosis or calibrated disease probabilities.',
			};
		};
		try {
			return db
				? await work(db)
				: await withTransaction(
						this.prisma,
						work,
						ruleConflictTx(true),
					);
		} catch (error) {
			if (error instanceof HttpException) throw error;
			throw new ServiceUnavailableException(
				'DASS42 inference unavailable',
			);
		}
	}
}
