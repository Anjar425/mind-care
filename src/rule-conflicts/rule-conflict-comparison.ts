import { createHash } from 'node:crypto';
import type { CATEGORY, LEVEL, SEVERITY } from '../prisma/generated/enums';
import type { RuleAst, RuleContent } from '../rules/rules.types';

export const COMPARISON_VERSION = 'homogeneous-ac-v1';
export const digest = (value: unknown) =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type ComparisonNode =
	| ['TERM', string, LEVEL]
	| ['NOT', ComparisonNode]
	| ['AND' | 'OR', ComparisonNode[]];
export function normalizeAntecedent(ast: RuleAst): ComparisonNode {
	if (ast[0] === 'TERM') return [...ast];
	if (ast[0] === 'NOT') return ['NOT', normalizeAntecedent(ast[1])];
	const op = ast[0];
	const children: ComparisonNode[] = [];
	for (const child of [
		normalizeAntecedent(ast[1]),
		normalizeAntecedent(ast[2]),
	]) {
		if (child[0] === op) children.push(...child[1]);
		else children.push(child);
	}
	children.sort((a, b) => {
		const left = JSON.stringify(a),
			right = JSON.stringify(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
	return [op, children];
}
export interface ConflictInput {
	id: number;
	revisionId: string;
	version: number;
	authorExpertId: string;
	authorUserId: string;
	grammarVersion: string;
	content: RuleContent;
	antecedent: RuleAst;
}
export interface ConflictBucket {
	caseKey: string;
	sourceHash: string;
	normalized: ComparisonNode;
	category: CATEGORY;
	members: ConflictInput[];
}
export function findConflicts(
	inputs: readonly ConflictInput[],
): ConflictBucket[] {
	const groups = new Map<
		string,
		{
			normalized: ComparisonNode;
			category: CATEGORY;
			members: ConflictInput[];
		}
	>();
	for (const input of inputs) {
		const normalized = normalizeAntecedent(input.antecedent);
		const category = input.content.conclusion.category;
		const key = JSON.stringify([
			COMPARISON_VERSION,
			input.content.catalogVersion,
			input.grammarVersion,
			category,
			normalized,
		]);
		const bucket = groups.get(key) ?? { normalized, category, members: [] };
		bucket.members.push(input);
		groups.set(key, bucket);
	}
	return [...groups.entries()]
		.filter(
			([, b]) =>
				new Set<SEVERITY>(
					b.members.map((m) => m.content.conclusion.severity),
				).size > 1,
		)
		.map(([key, b]) => {
			const members = [...b.members].sort((a, b) => a.id - b.id);
			return {
				caseKey: digest(key),
				sourceHash: digest(
					members.map((m) => [
						m.id,
						m.revisionId,
						m.version,
						m.authorExpertId,
						m.authorUserId,
						digest(m.content),
						m.content.conclusion.severity,
					]),
				),
				...b,
				members,
			};
		})
		.sort((a, b) =>
			a.caseKey < b.caseKey ? -1 : a.caseKey > b.caseKey ? 1 : 0,
		);
}
