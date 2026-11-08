import { compileRule } from './rule-grammar';
import { validRuleContent } from '../../../test/rules-mocks';

describe('DASS42 structured grammar', () => {
	it('should preserve outgoing mixed operators and NOT with the final term in a left fold', () => {
		const original = validRuleContent();
		const before = structuredClone(original);
		const compiled = compileRule(original);
		expect(compiled.antecedent).toEqual([
			'AND',
			[
				'OR',
				['TERM', 'DASS42-Q01', 'LOW'],
				['NOT', ['TERM', 'DASS42-Q17', 'MEDIUM']],
			],
			['TERM', 'DASS42-Q38', 'HIGH'],
		]);
		expect(original).toEqual(before);
		expect(compiled.original).toEqual(before);
	});
	it('should accept one term only when it terminates with THEN', () => {
		const c = validRuleContent();
		c.premises = [c.premises[2]];
		expect(compileRule(c).antecedent).toEqual([
			'TERM',
			'DASS42-Q38',
			'HIGH',
		]);
	});
	it('should preserve repetition and accept 100 clauses without deduplication', () => {
		const c = validRuleContent();
		c.premises = Array.from({ length: 100 }, (_, i) => ({
			...c.premises[0],
			joinToNext: i === 99 ? 'THEN' : 'AND',
		}));
		expect(compileRule(c).original.premises).toHaveLength(100);
	});
	it.each([0, 101])('should reject %i clauses', (n) => {
		const c = validRuleContent();
		c.premises = Array.from({ length: n }, () => c.premises[0]);
		expect(() => compileRule(c)).toThrow();
	});
	it.each(['AND', 'OR'])('should reject a final %s connector', (op) => {
		const c = validRuleContent();
		expect(() =>
			compileRule({
				...c,
				premises: [{ ...c.premises[0], joinToNext: op }],
			}),
		).toThrow();
	});
	it.each([0, 1])(
		'should reject misplaced or repeated THEN at index %i',
		(i) => {
			const c = validRuleContent();
			c.premises[i].joinToNext = 'THEN';
			expect(() => compileRule(c)).toThrow();
		},
	);
	it.each(['not', 'NO', '', null, 1])(
		'should reject unsupported prefix %p',
		(v) => {
			const c = validRuleContent();
			expect(() =>
				compileRule({
					...c,
					premises: [{ ...c.premises[2], prefix: v }],
				}),
			).toThrow();
		},
	);
	it.each(['med', 'low', '', null, 1])(
		'should reject unsupported level %p',
		(v) => {
			const c = validRuleContent();
			expect(() =>
				compileRule({
					...c,
					premises: [{ ...c.premises[2], level: v }],
				}),
			).toThrow();
		},
	);
	it.each(['DASS21-Q01', 'DASS42-Q00', 'DASS42-Q43', 'Q13', 13, null])(
		'should reject foreign question %p',
		(v) => {
			const c = validRuleContent();
			expect(() =>
				compileRule({
					...c,
					premises: [{ ...c.premises[2], dass42Id: v }],
				}),
			).toThrow();
		},
	);
	it.each([null, [], {}, 'text'])(
		'should reject incomplete/non-object content %p',
		(v) => expect(() => compileRule(v)).toThrow(),
	);
	it.each([
		'authorExpertId',
		'groupId',
		'stateHash',
		'compiled',
		'result',
		'THEN',
	])('should reject caller-selected extra %s', (k) =>
		expect(() =>
			compileRule({ ...validRuleContent(), [k]: 'injected' }),
		).toThrow(),
	);
	it('should reject extra nested fields, nullable conclusion and unsupported conclusion', () => {
		const c = validRuleContent();
		for (const v of [
			{ ...c, conclusion: null },
			{ ...c, conclusion: { ...c.conclusion, extra: true } },
			{ ...c, conclusion: { category: 'OTHER', severity: 'NORMAL' } },
			{ ...c, premises: [{ ...c.premises[2], position: 7 }] },
		])
			expect(() => compileRule(v)).toThrow();
	});
	it('should fingerprint antecedents without conclusion while retaining release/order/NOT identity', () => {
		const c = validRuleContent();
		const a = compileRule(c);
		c.conclusion.severity = 'SEVERE';
		expect(compileRule(c).antecedentHash).toBe(a.antecedentHash);
		c.premises[1].prefix = 'NO_PREFIX';
		expect(compileRule(c).antecedentHash).not.toBe(a.antecedentHash);
	});
	it('should validate comparison metadata separately from original authored content', () => {
		const c = validRuleContent();
		expect(
			compileRule({ ...c, expectedStateHash: 'a'.repeat(64) }, true)
				.original,
		).toEqual(c);
		expect(() =>
			compileRule({ ...c, expectedStateHash: 'invalid' }, true),
		).toThrow();
	});
});
