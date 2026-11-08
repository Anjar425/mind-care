import { compileRule } from '../rule-grammar';
import { validRuleContent } from '../../../../test/rules-mocks';
import {
	findConflicts,
	normalizeAntecedent,
	type ConflictInput,
} from './rule-conflict-comparison';
import type { RuleAst } from '../rules.types';
const a: RuleAst = ['TERM', 'DASS42-Q01', 'LOW'],
	b: RuleAst = ['TERM', 'DASS42-Q02', 'HIGH'],
	c: RuleAst = ['TERM', 'DASS42-Q03', 'MEDIUM'];
const normalized = (ast: RuleAst) => JSON.stringify(normalizeAntecedent(ast));
describe('Versioned conservative conflict equivalence', () => {
	it.each(['AND', 'OR'] as const)(
		'normalizes reordered and regrouped homogeneous %s chains',
		(op) => {
			expect(normalized([op, [op, a, b], c])).toBe(
				normalized([op, c, [op, b, a]]),
			);
		},
	);
	it('preserves left-to-right mixed operator boundaries', () => {
		expect(normalized(['OR', ['AND', a, b], c])).not.toBe(
			normalized(['AND', a, ['OR', b, c]]),
		);
	});
	it('retains NOT scope and repeated literals without Boolean simplification', () => {
		expect(normalized(['AND', a, a])).not.toBe(normalized(a));
		expect(normalized(['NOT', ['AND', a, b]])).not.toBe(
			normalized(['OR', ['NOT', a], ['NOT', b]]),
		);
		expect(normalized(['AND', a, ['NOT', b]])).not.toBe(
			normalized(['AND', ['NOT', a], b]),
		);
	});
	const input = (id: number): ConflictInput => {
		const content = validRuleContent(),
			compiled = compileRule(content);
		return {
			id,
			revisionId: `r${id}`,
			version: 1,
			authorExpertId: `a${id}`,
			authorUserId: `u${id}`,
			grammarVersion: compiled.grammarVersion,
			content,
			antecedent: compiled.antecedent,
		};
	};
	it('compares severity within category only', () => {
		const x = input(1),
			y = input(2);
		expect(findConflicts([x, y])).toHaveLength(0);
		y.content.conclusion.category = 'ANXIETY';
		y.content.conclusion.severity = 'MILD';
		expect(findConflicts([x, y])).toHaveLength(0);
		y.content.conclusion.category = 'DEPRESSION';
		expect(findConflicts([x, y])).toHaveLength(1);
	});
	it('includes exact source content in conflict snapshot identity', () => {
		const x = input(1),
			y = input(2);
		y.content.conclusion.severity = 'MILD';
		const before = findConflicts([x, y])[0];
		y.content.premises[0].level = 'HIGH';
		expect(findConflicts([x, y])[0].sourceHash).not.toBe(before.sourceHash);
	});
});
