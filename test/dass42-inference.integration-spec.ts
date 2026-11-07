import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../src/prisma/generated/client';
import { groupUserId } from './groups-mocks';
import {
	inferenceFixture,
	inferenceRule,
	inferenceSubmission,
	fillInferenceRules,
} from './dass42-inference-mocks';

describe('Mamdani integrated with actual current rule/reference/group services and synthetic persistence', () => {
	let f: Awaited<ReturnType<typeof inferenceFixture>>;
	beforeEach(async () => {
		f = await inferenceFixture();
	});
	afterEach(() => jest.restoreAllMocks());
	it('should compute the source result without any persistent rule/group/notification/history side effect', async () => {
		const before = structuredClone({
			rules: f.m.state,
			groups: f.m.groups.state,
			notices: f.m.conflicts.state,
		});
		const result = await f.inference.evaluate(
			f.groupId,
			inferenceSubmission(),
		);
		expect(result.result.depression.score).toBeCloseTo(14 / 3, 12);
		expect(result.result.anxiety.score).toBeCloseTo(7 / 3, 12);
		expect(result.result.stress.score).toBeCloseTo(49 / 9, 12);
		expect({
			rules: f.m.state,
			groups: f.m.groups.state,
			notices: f.m.conflicts.state,
		}).toEqual(before);
	});
	it('should preserve float answers and caller transaction across current eligibility, references and math', async () => {
		const input = inferenceSubmission();
		input.answers[0].score = 1.5;
		input.answers.reverse();
		f.m.transaction.mockClear();
		const result = await f.inference.evaluate(
			f.groupId,
			input,
			f.m.tx as unknown as Prisma.TransactionClient,
		);
		expect(result.result.depression.score).toBeCloseTo(397 / 69, 12);
		expect(f.m.transaction).not.toHaveBeenCalled();
	});
	it('should exclude corrupt ineligible authors before decode but reject them if they become eligible', async () => {
		for (const category of ['DEPRESSION', 'ANXIETY', 'STRESS'] as const)
			await f.rules.create(
				groupUserId(2),
				f.groupId,
				inferenceRule(category),
			);
		f.m.groups.state.experts[0].profileValidatedAt = null;
		f.m.state.revisions[0].originalPayload = { corrupt: true };
		expect(
			(await f.inference.evaluate(f.groupId, inferenceSubmission()))
				.result.depression.score,
		).toBeCloseTo(14 / 3, 12);
		f.m.groups.state.experts[0].profileValidatedAt = new Date();
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('should reject current conflicts even after a previous successful evaluation', async () => {
		await f.inference.evaluate(f.groupId, inferenceSubmission());
		await f.rules.create(
			groupUserId(2),
			f.groupId,
			inferenceRule('DEPRESSION', 'MILD'),
		);
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should fail all categories if an authored category is missing', async () => {
		f.m.state.rules[2].archivedAt = new Date();
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should isolate groups and refuse an inactive answer vector without default normal or global fallback', async () => {
		const other = f.m.groups.seedGroup([1, 2, 3, 4, 5]);
		for (const category of ['DEPRESSION', 'ANXIETY', 'STRESS'] as const) {
			const content = inferenceRule(category);
			content.premises[0].level = 'HIGH';
			await f.rules.create(groupUserId(1), other, content);
		}
		await expect(
			f.inference.evaluate(other, inferenceSubmission()),
		).rejects.toBeInstanceOf(ConflictException);
		expect(
			(await f.inference.evaluate(f.groupId, inferenceSubmission()))
				.groupId,
		).toBe(f.groupId);
		const result = await f.inference.evaluate(
			other,
			inferenceSubmission(3),
		);
		expect(result.sourceHash).not.toBe(
			(await f.inference.evaluate(f.groupId, inferenceSubmission()))
				.sourceHash,
		);
	});
	it.each([
		'archive',
		'suspend-author',
		'too-few-valid',
		'expired-author',
		'role-revoked',
	])('should recheck current source when %s changes', async (kind) => {
		await f.inference.evaluate(f.groupId, inferenceSubmission());
		if (kind === 'archive')
			f.m.groups.state.groups[0].archivedAt = new Date();
		if (kind === 'suspend-author')
			f.m.groups.state.experts[0].credentialSuspendedAt = new Date();
		if (kind === 'too-few-valid') {
			f.m.groups.state.experts[1].profileValidatedAt = null;
			f.m.groups.state.experts[2].profileValidatedAt = null;
		}
		if (kind === 'expired-author')
			f.m.groups.state.experts[0].credentialRevisions[0].expiresAt =
				new Date(0);
		if (kind === 'role-revoked')
			f.m.groups.state.experts[0].user.role = 'USER';
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should bind a new result to the latest authored revision rather than cached numeric output', async () => {
		const before = await f.inference.evaluate(
			f.groupId,
			inferenceSubmission(),
		);
		const id = f.m.state.rules[0].id;
		const current = await f.rules.detail(groupUserId(1), f.groupId, id);
		await f.rules.update(groupUserId(1), f.groupId, id, {
			...inferenceRule('DEPRESSION', 'MODERATE'),
			expectedStateHash: current.stateHash,
		});
		const after = await f.inference.evaluate(
			f.groupId,
			inferenceSubmission(),
		);
		expect(after.sourceHash).not.toBe(before.sourceHash);
		expect(after.result.depression.score).toBeCloseTo(18, 12);
		expect(f.m.state.revisions.filter((r) => r.ruleId === id)).toHaveLength(
			2,
		);
	});
	it('should fail closed on missing current reference data or corrupted relational evidence', async () => {
		f.m.tx.dASS42.findMany.mockResolvedValueOnce([]);
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		f.m.state.revisions[0].premises[0].level = 'HIGH';
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('should accept all1000 current rules and reject1001 without computing a partial ruleset', async () => {
		fillInferenceRules(f, 1000);
		f.m.tx.rule.findMany.mockClear();
		expect(
			(await f.inference.evaluate(f.groupId, inferenceSubmission()))
				.result.depression.score,
		).toBeCloseTo(14 / 3, 12);
		expect(f.m.tx.rule.findMany.mock.calls.at(-1)![0].take).toBe(1);
		fillInferenceRules(f, 1001);
		const decode = jest.spyOn(f.store, 'decode');
		f.m.tx.rule.findMany.mockClear();
		await expect(
			f.inference.evaluate(f.groupId, inferenceSubmission()),
		).rejects.toThrow('capacity exceeded');
		expect(decode).toHaveBeenCalledTimes(1000);
		expect(f.m.tx.rule.findMany.mock.calls.at(-1)![0].take).toBe(1);
	});
});
