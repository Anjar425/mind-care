import { compileRule } from '../../rules/rule-grammar';
import type { RuleAst } from '../../rules/rules.types';
import type { NumericRule } from '../dass42.types';
import { inferenceRule } from '../../../../test/dass42-inference-mocks';
import {
	aggregateCurves,
	evaluateAntecedent,
	fuzzify,
	inferMamdani,
} from './mamdani';
import { sampleCurve, interpolate } from './membership';
import { centroid, InferenceCoverageError } from './centroid';

const rules = (): NumericRule[] =>
	(['DEPRESSION', 'ANXIETY', 'STRESS'] as const).map((category) => {
		const content = inferenceRule(category);
		return {
			antecedent: compileRule(content).antecedent,
			conclusion: content.conclusion,
		};
	});
describe('Original-grammar sampled Mamdani pipeline', () => {
	it('should fuzzify fractional answers into source samples without normalizing the degrees', () => {
		const degrees = fuzzify(new Map([['DASS42-Q01', 1.5]])).get(
			'DASS42-Q01',
		)!;
		expect(degrees.LOW).toBeCloseTo(1 / 6, 14);
		expect(degrees.MEDIUM).toBe(0.5);
		expect(degrees.HIGH).toBeCloseTo(1 / 6, 14);
		expect(Object.values(degrees).reduce((a, b) => a + b)).toBeCloseTo(
			5 / 6,
			14,
		);
	});
	it('should evaluate unary NOT and authored left-to-right mixed operators', () => {
		const content = inferenceRule();
		content.premises = [
			{
				dass42Id: 'DASS42-Q01',
				level: 'LOW',
				prefix: 'NO_PREFIX',
				joinToNext: 'OR',
			},
			{
				dass42Id: 'DASS42-Q02',
				level: 'MEDIUM',
				prefix: 'NO_PREFIX',
				joinToNext: 'AND',
			},
			{
				dass42Id: 'DASS42-Q03',
				level: 'HIGH',
				prefix: 'NO_PREFIX',
				joinToNext: 'THEN',
			},
		];
		const inputs = fuzzify(
			new Map([
				['DASS42-Q01', 1],
				['DASS42-Q02', 1],
				['DASS42-Q03', 0],
			]),
		);
		const ast = compileRule(content).antecedent;
		expect(evaluateAntecedent(ast, inputs)).toBe(0);
		expect(evaluateAntecedent(['NOT', ast], inputs)).toBe(1);
		expect(
			evaluateAntecedent(['TERM', 'DASS42-Q01', 'LOW'], inputs),
		).toBeCloseTo(1 / 3, 14);
	});
	it('should include the last THEN premise instead of reproducing the prototype connector bug', () => {
		const content = inferenceRule();
		content.premises[0].joinToNext = 'AND';
		content.premises.push({
			dass42Id: 'DASS42-Q02',
			level: 'HIGH',
			prefix: 'NO_PREFIX',
			joinToNext: 'THEN',
		});
		expect(
			evaluateAntecedent(
				compileRule(content).antecedent,
				fuzzify(
					new Map([
						['DASS42-Q01', 0],
						['DASS42-Q02', 0],
					]),
				),
			),
		).toBe(0);
	});
	it('should integrate full normal consequent shapes for zero answers rather than invent zero scores', () => {
		const result = inferMamdani(rules(), new Map([['DASS42-Q01', 0]]));
		// Independent polygon geometry: normal trap D, left triangle A, normal trap S.
		expect(result.depression.score).toBeCloseTo(14 / 3, 12);
		expect(result.anxiety.score).toBeCloseTo(7 / 3, 12);
		expect(result.stress.score).toBeCloseTo(49 / 9, 12);
		expect(Object.keys(result)).toEqual([
			'depression',
			'anxiety',
			'stress',
		]);
		expect(Object.keys(result.depression)).toEqual([
			'category',
			'score',
			'membership_degrees',
		]);
		expect(Object.keys(result.depression.membership_degrees)).toEqual([
			'Normal',
			'Mild',
			'Moderate',
			'Severe',
			'Extremely Severe',
		]);
	});
	it('should use fractional cut intersections and original output memberships at the centroid', () => {
		const result = inferMamdani(rules(), new Map([['DASS42-Q01', 1.5]]));
		// Trap[0,0,6,12] clipped at1/6: area23/12, first moment397/36.
		expect(result.depression.score).toBeCloseTo(397 / 69, 12);
		expect(result.depression.membership_degrees.Normal).toBe(1);
		expect(result.depression.membership_degrees.Normal).toBeGreaterThan(
			1 / 6,
		);
	});
	it('should preserve source output sampling rather than adding analytic envelope-switch intersections', () => {
		const grid = Array.from({ length: 43 }, (_, i) => i);
		const curve = aggregateCurves([
			{ curve: sampleCurve([8, 12, 16], grid), cut: 1 },
			{ curve: sampleCurve([12, 18, 24], grid), cut: 1 },
		]);
		expect(curve.universe).not.toContain(14.4);
		expect(interpolate(curve, 14.4)).toBe(0.5);
	});
	it('should integrate an asymmetric clipped output using polygon geometry', () => {
		const output = aggregateCurves([
			{ curve: sampleCurve([0, 1, 3], [0, 1, 2, 3]), cut: 0.25 },
		]);
		expect(output.universe).toContain(0.25);
		expect(output.universe).toContain(2.5);
		// Independent rectangle + two triangle areas/moments, not a severity rank average.
		expect(centroid(output)).toBeCloseTo(121 / 84, 12);
	});
	it('should use max accumulation so duplicates cannot add votes or alter output', () => {
		const source = rules();
		const answers = new Map([['DASS42-Q01', 0.1]]);
		expect(inferMamdani([...source, ...source], answers)).toEqual(
			inferMamdani(source, answers),
		);
	});
	it('should support consequent levels and preserve the truncated anxiety/stress domains', () => {
		const source = rules();
		for (const rule of source)
			rule.conclusion.severity = 'EXTREMELY_SEVERE';
		const result = inferMamdani(source, new Map([['DASS42-Q01', 0]]));
		expect(result.depression.score).toBeLessThanOrEqual(42);
		expect(result.anxiety.score).toBeLessThan(41);
		expect(result.stress.score).toBeLessThan(41);
		expect(result.anxiety.membership_degrees['Extremely Severe']).toBe(1);
	});
	it('should reject any missing or inactive category without returning partial results', () => {
		expect(() =>
			inferMamdani(rules().slice(0, 2), new Map([['DASS42-Q01', 0]])),
		).toThrow(InferenceCoverageError);
		expect(() =>
			inferMamdani(rules(), new Map([['DASS42-Q01', 3]])),
		).toThrow(InferenceCoverageError);
	});
	it('should reject unsupported/corrupt terms and conclusions, not default to LOW or NORMAL', () => {
		const inputs = fuzzify(new Map([['DASS42-Q01', 1]]));
		for (const node of [
			['TERM', 'missing', 'LOW'],
			['TERM', 'DASS42-Q01', 'invalid'],
			['XOR', ['TERM', 'DASS42-Q01', 'LOW']],
		])
			expect(() =>
				evaluateAntecedent(node as unknown as RuleAst, inputs),
			).toThrow();
		const source = rules();
		Reflect.set(source[0].conclusion, 'severity', 'INVALID');
		expect(() =>
			inferMamdani(source, new Map([['DASS42-Q01', 0]])),
		).toThrow();
	});
	it('should reject nonfinite/raw out-of-range inputs and inconsistent output domains', () => {
		expect(() => fuzzify(new Map([['Q', NaN]]))).toThrow();
		expect(() => fuzzify(new Map([['Q', 3.1]]))).toThrow();
		expect(() =>
			aggregateCurves([
				{ curve: sampleCurve([0, 1, 2], [0, 1, 2]), cut: 1 },
				{ curve: sampleCurve([0, 1, 2], [0, 1, 2, 3]), cut: 1 },
			]),
		).toThrow();
	});
});
