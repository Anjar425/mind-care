import { ConflictException } from '@nestjs/common';
import {
	publicDass42Input,
	publicQdssInput,
	realScreeningFixture,
	screeningMocks,
} from '../../../test/screening-mocks';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
describe('Same-snapshot public orchestration and allowlisted responses', () => {
	it('should return explicit guest GLOBAL QDSS without any private source fields or history write', async () => {
		const f = screeningMocks();
		const result = await f.service.evaluateQdss(publicQdssInput());
		expect(result.audience).toBe('GUEST');
		expect(result.accountId).toBeNull();
		expect(result.context.group).toBeNull();
		expect(result.presentation.message).toBeNull();
		expect(f.qdss.evaluate).toHaveBeenCalledWith(
			null,
			publicQdssInput().answers,
			f.tx,
		);
		expect(f.h.entries.size).toBe(0);
	});
	it('should pass GROUP metadata, catalog and evaluation through one transaction and project only public fields', async () => {
		const f = screeningMocks();
		const result = await f.service.evaluateQdss(publicQdssInput(true));
		expect(result.context.group).toEqual({
			id: 1,
			name: 'Synthetic group',
		});
		expect(JSON.stringify(result)).not.toContain('privateMemberships');
		expect(f.transaction).toHaveBeenCalledTimes(1);
		expect(f.references.getQuestionnaire).toHaveBeenCalledWith(
			'DASS21',
			f.tx,
		);
	});
	it('should reject old catalog without computing or switching source', async () => {
		const f = screeningMocks();
		await expect(
			f.service.evaluateQdss({
				...publicQdssInput(),
				catalogVersion: 'old',
			}),
		).rejects.toThrow('Reload');
		expect(f.qdss.evaluate).not.toHaveBeenCalled();
	});
	it('should capture answers and actor before the first await', async () => {
		const f = screeningMocks();
		const input = publicDass42Input();
		const work = f.service.evaluateDass42(input, f.principal);
		input.answers[0].score = 3;
		f.principal.sub = 'mutated';
		const result = await work;
		expect(result.accountId).not.toBe('mutated');
		expect(f.dass42.evaluate.mock.calls[0]).toEqual([
			1,
			{
				catalogVersion: input.catalogVersion,
				answers: publicDass42Input().answers,
			},
			f.tx,
		]);
	});
	it('should retain exact fractional DASS42 result and source timestamps without returning raw rules', async () => {
		const f = screeningMocks();
		const result = await f.service.evaluateDass42(publicDass42Input());
		expect(result.result).toEqual((await f.dass42.evaluate()).result);
		expect(result.context.evaluatedAt).toBe('2026-11-02T00:00:00.000Z');
		expect(result.context.algorithmVersion).toBe('web-mamdani-grid-v1');
		expect(result).not.toHaveProperty('rules');
	});
	it('should fail source errors wholly without fallback or partial result', async () => {
		const f = screeningMocks();
		f.dass42.evaluate.mockRejectedValueOnce(
			new ConflictException('private conflict details'),
		);
		await expect(
			f.service.evaluateDass42(publicDass42Input()),
		).rejects.toThrow();
		expect(f.qdss.evaluate).not.toHaveBeenCalled();
		expect(f.h.entries.size).toBe(0);
	});
	it('should reject invalid or privately extended numerical output instead of spreading it', async () => {
		const f = screeningMocks();
		f.qdss.evaluate.mockResolvedValueOnce({
			...(await f.qdss.evaluate()),
			result: { ...historyResult(), privateSamples: [] },
		});
		await expect(f.service.evaluateQdss(publicQdssInput())).rejects.toThrow(
			'requires review',
		);
		function historyResult() {
			return {
				depression: 0.5,
				anxiety: 0.3,
				stress: 0.2,
				copyHistoryLabel: 'Moderate',
			};
		}
	});
});
describe('Public evaluation through real current-source and numerical services', () => {
	it('should equal existing internal QDSS/FIS outputs and perform no calibration/history/governance writes', async () => {
		const f = await realScreeningFixture();
		const before = {
			q: structuredClone(f.q.m.state),
			rules: structuredClone(f.d.m.state),
			conflicts: structuredClone(f.d.m.conflicts.state),
		};
		for (const group of [false, true]) {
			const input = publicQdssInput(group);
			const response = await f.service.evaluateQdss(input);
			expect(response.result).toEqual(
				(
					await f.q.evaluation.evaluate(
						group ? 1 : null,
						input.answers,
						f.tx as unknown as Prisma.TransactionClient,
					)
				).result,
			);
		}
		const input = publicDass42Input();
		const result = await f.service.evaluateDass42(input);
		expect(result.result).toEqual(
			(
				await f.d.inference.evaluate(
					1,
					{
						catalogVersion: input.catalogVersion,
						answers: input.answers,
					},
					f.tx as unknown as Prisma.TransactionClient,
				)
			).result,
		);
		expect(f.q.m.state).toEqual(before.q);
		expect(f.d.m.state).toEqual(before.rules);
		expect(f.d.m.conflicts.state).toEqual(before.conflicts);
	});
	it('should recheck current eligibility and stale model rather than trust an earlier group listing', async () => {
		const f = await realScreeningFixture();
		f.q.m.groups.state.experts[0].clinicalHours =
			(f.q.m.groups.state.experts[0].clinicalHours ?? 0) + 1;
		await expect(
			f.service.evaluateQdss(publicQdssInput(true)),
		).rejects.toThrow('changed');
		f.q.m.groups.state.experts[1].credentialSuspendedAt = new Date();
		f.q.m.groups.state.experts[2].credentialSuspendedAt = new Date();
		await expect(
			f.service.evaluateDass42(publicDass42Input()),
		).rejects.toThrow('eligible');
	});
});
