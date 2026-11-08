import { BadRequestException } from '@nestjs/common';
import { compileRule } from '../rules/rule-grammar';
import type { RuleContent } from '../rules/rules.types';
import type { RuleResolutionKind } from '../../infrastructure/prisma/generated/enums';
import {
	digest,
	findConflicts,
	type ConflictInput,
} from '../rules/conflicts/rule-conflict-comparison';

export interface ReviewedAction {
	ruleId: number;
	revisionId: string;
	type: RuleResolutionKind;
	content: RuleContent | null;
}
interface ResolutionInput {
	ruleId: number;
	expectedRevisionId: string;
	type: RuleResolutionKind;
	content?: unknown;
}
export function parseResolutionActions(
	rows: readonly ResolutionInput[],
): ReviewedAction[] {
	if (!Array.isArray(rows) || !rows.length)
		throw new BadRequestException('A nonempty correction plan is required');
	const seen = new Set<number>();
	return rows.map((row: ResolutionInput) => {
		if (
			!row ||
			typeof row !== 'object' ||
			!Number.isSafeInteger(row.ruleId) ||
			row.ruleId < 1 ||
			row.ruleId > 2147483647 ||
			seen.has(row.ruleId) ||
			typeof row.expectedRevisionId !== 'string' ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				row.expectedRevisionId,
			) ||
			!['REVISE', 'ARCHIVE'].includes(row.type)
		)
			throw new BadRequestException(
				'Each correction target must be a unique supported rule/revision/action',
			);
		const keys = Object.keys(row).filter(
			(k) => (row as unknown as Record<string, unknown>)[k] !== undefined,
		);
		if (
			keys.some(
				(k) =>
					![
						'ruleId',
						'expectedRevisionId',
						'type',
						...(row.type === 'REVISE' ? ['content'] : []),
					].includes(k),
			)
		)
			throw new BadRequestException('Unsupported correction fields');
		seen.add(row.ruleId);
		return {
			ruleId: row.ruleId,
			revisionId: row.expectedRevisionId,
			type: row.type,
			content:
				row.type === 'REVISE'
					? compileRule(row.content).original
					: null,
		};
	});
}
export function assertProjectedCorrection(
	inputs: readonly ConflictInput[],
	caseKey: string,
	actions: readonly ReviewedAction[],
) {
	const byId = new Map(actions.map((a) => [a.ruleId, a]));
	const projected = inputs.flatMap((input) => {
		const action = byId.get(input.id);
		if (!action) return [input];
		if (action.type === 'ARCHIVE') return [];
		const compiled = compileRule(action.content);
		return [
			{
				...input,
				content: compiled.original,
				antecedent: compiled.antecedent,
				grammarVersion: compiled.grammarVersion,
				revisionId: `proposed:${input.id}`,
			},
		];
	});
	const before = new Map(
		findConflicts(inputs).map((c) => [c.caseKey, c.sourceHash]),
	);
	for (const conflict of findConflicts(projected))
		if (
			conflict.caseKey === caseKey ||
			before.get(conflict.caseKey) !== conflict.sourceHash
		)
			throw new BadRequestException(
				'The plan must remove the target conflict without introducing a new contradiction',
			);
}
export function resolutionPlanDigest(input: {
	caseId: string;
	sourceHash: string;
	comparisonVersion: string;
	reason: string;
	expiresAt: Date;
	actions: readonly ReviewedAction[];
	participants: readonly {
		expertId: string;
		userId: string;
		membershipId: string | null;
		membershipJoinedAt: Date | null;
	}[];
}) {
	return digest([
		input.caseId,
		input.sourceHash,
		input.comparisonVersion,
		input.reason,
		input.expiresAt.toISOString(),
		input.actions.map((a) => [a.ruleId, a.revisionId, a.type, a.content]),
		[...input.participants]
			.sort((a, b) =>
				a.expertId < b.expertId ? -1 : a.expertId > b.expertId ? 1 : 0,
			)
			.map((p) => [
				p.expertId,
				p.userId,
				p.membershipId,
				p.membershipJoinedAt?.toISOString() ?? null,
			]),
	]);
}
