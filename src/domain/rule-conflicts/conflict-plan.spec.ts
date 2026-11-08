import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
	assertProjectedCorrection,
	parseResolutionActions,
	resolutionPlanDigest,
	type ReviewedAction,
} from './conflict-plan';
import {
	findConflicts,
	type ConflictInput,
} from '../rules/conflicts/rule-conflict-comparison';
import { compileRule } from '../rules/rule-grammar';
import { validRuleContent } from '../../../test/rules-mocks';
const input = (
	id: number,
	severity: 'MILD' | 'MODERATE',
	question = 'DASS42-Q01',
): ConflictInput => {
	const content = validRuleContent();
	content.premises = [
		{ ...content.premises[0], dass42Id: question, joinToNext: 'THEN' },
	];
	content.conclusion.severity = severity;
	const compiled = compileRule(content);
	return {
		id,
		revisionId: randomUUID(),
		version: 1,
		authorExpertId: `e${id}`,
		authorUserId: `u${id}`,
		grammarVersion: compiled.grammarVersion,
		content,
		antecedent: compiled.antecedent,
	};
};
describe('Exact immutable correction plan', () => {
	it('rejects a change that moves the contradiction to another antecedent', () => {
		const a = input(1, 'MODERATE'),
			b = input(2, 'MILD'),
			c = input(3, 'MODERATE', 'DASS42-Q02');
		const action: ReviewedAction = {
			ruleId: 2,
			revisionId: b.revisionId,
			type: 'REVISE',
			content: { ...b.content, premises: c.content.premises },
		};
		expect(() =>
			assertProjectedCorrection(
				[a, b, c],
				findConflicts([a, b])[0].caseKey,
				[action],
			),
		).toThrow(BadRequestException);
	});
	it('retains an unrelated pre-existing conflict while removing only the reviewed conflict', () => {
		const rows = [
			input(1, 'MODERATE'),
			input(2, 'MILD'),
			input(3, 'MODERATE', 'DASS42-Q02'),
			input(4, 'MILD', 'DASS42-Q02'),
		];
		expect(() =>
			assertProjectedCorrection(
				rows,
				findConflicts(rows).find((c) =>
					c.members.some((m) => m.id === 1),
				)!.caseKey,
				[
					{
						ruleId: 2,
						revisionId: rows[1].revisionId,
						type: 'ARCHIVE',
						content: null,
					},
				],
			),
		).not.toThrow();
	});
	it.each([
		'duplicate',
		'missing-content',
		'archive-content',
		'invalid-revision',
		'extra-field',
	] as const)('rejects invalid %s plan input', (kind) => {
		const action = {
			ruleId: 1,
			expectedRevisionId: randomUUID() as string,
			type: 'ARCHIVE' as 'ARCHIVE' | 'REVISE',
			content: undefined as unknown,
		};
		let actions = [action];
		if (kind === 'duplicate') actions = [action, action];
		if (kind === 'missing-content') action.type = 'REVISE';
		if (kind === 'archive-content') action.content = validRuleContent();
		if (kind === 'invalid-revision') action.expectedRevisionId = 'other';
		if (kind === 'extra-field')
			Object.assign(action, { authorExpertId: 'injected' });
		expect(() => parseResolutionActions(actions)).toThrow(
			BadRequestException,
		);
	});
	it('binds exact ordered source content, expiry and all required membership periods into the digest', () => {
		const content = validRuleContent();
		const p = {
			caseId: randomUUID(),
			sourceHash: 'a'.repeat(64),
			comparisonVersion: 'homogeneous-ac-v1',
			reason: 'Review',
			expiresAt: new Date('2027-01-01'),
			actions: [
				{
					ruleId: 1,
					revisionId: randomUUID(),
					type: 'REVISE' as const,
					content,
				},
			],
			participants: [
				{
					expertId: 'e1',
					userId: 'u1',
					membershipId: 'm1',
					membershipJoinedAt: new Date('2026-01-01'),
				},
			],
		};
		const hash = resolutionPlanDigest(p);
		expect(
			resolutionPlanDigest({ ...p, expiresAt: new Date('2027-01-02') }),
		).not.toBe(hash);
		expect(
			resolutionPlanDigest({
				...p,
				participants: [
					{
						...p.participants[0],
						membershipJoinedAt: new Date('2026-01-02'),
					},
				],
			}),
		).not.toBe(hash);
		const changed = structuredClone(p);
		changed.actions[0].content.premises.reverse();
		expect(resolutionPlanDigest(changed)).not.toBe(hash);
	});
});
