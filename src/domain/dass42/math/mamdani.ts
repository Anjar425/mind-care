import type {
	LEVEL,
	SEVERITY,
} from '../../../infrastructure/prisma/generated/enums';
import type { RuleAst } from '../../rules/rules.types';
import { MAX_RULE_PREMISES } from '../../rules/rule-grammar';
import { MAMDANI_CONFIG, MAX_INFERENCE_RULES } from '../dass42-mamdani.config';
import type {
	CategoryResult,
	NumericRule,
	SourceResult,
	SourceSeverity,
} from '../dass42.types';
import {
	sampleCurve,
	interpolate,
	cutCrossings,
	assertCurve,
	type SampledCurve,
} from './membership';
import { centroid, InferenceCoverageError } from './centroid';

export type Fuzzified = ReadonlyMap<string, Readonly<Record<LEVEL, number>>>;
const inputCurves = {
	LOW: sampleCurve(
		MAMDANI_CONFIG.inputTerms.LOW,
		MAMDANI_CONFIG.inputUniverse,
	),
	MEDIUM: sampleCurve(
		MAMDANI_CONFIG.inputTerms.MEDIUM,
		MAMDANI_CONFIG.inputUniverse,
	),
	HIGH: sampleCurve(
		MAMDANI_CONFIG.inputTerms.HIGH,
		MAMDANI_CONFIG.inputUniverse,
	),
};

export function fuzzify(scores: ReadonlyMap<string, number>): Fuzzified {
	return new Map(
		[...scores].map(([id, score]) => {
			if (!Number.isFinite(score) || score < 0 || score > 3)
				throw new Error('Invalid fuzzification input');
			return [
				id,
				{
					LOW: interpolate(inputCurves.LOW, score),
					MEDIUM: interpolate(inputCurves.MEDIUM, score),
					HIGH: interpolate(inputCurves.HIGH, score),
				},
			];
		}),
	);
}

export function evaluateAntecedent(ast: RuleAst, inputs: Fuzzified): number {
	let visited = 0;
	const walk = (value: unknown): number => {
		if (++visited > MAX_RULE_PREMISES * 3 || !Array.isArray(value))
			throw new Error('Invalid inference expression');
		const node: unknown[] = value;
		if (node[0] === 'TERM' && node.length === 3) {
			if (
				typeof node[1] !== 'string' ||
				!['LOW', 'MEDIUM', 'HIGH'].includes(node[2] as string)
			)
				throw new Error('Invalid inference term');
			const degrees = inputs.get(node[1]);
			const degree = degrees?.[node[2] as LEVEL];
			if (
				degree === undefined ||
				!Number.isFinite(degree) ||
				degree < 0 ||
				degree > 1
			)
				throw new Error('Missing inference term');
			return degree;
		}
		if (node[0] === 'NOT' && node.length === 2) return 1 - walk(node[1]);
		if (node[0] === 'AND' && node.length === 3)
			return Math.min(walk(node[1]), walk(node[2]));
		if (node[0] === 'OR' && node.length === 3)
			return Math.max(walk(node[1]), walk(node[2]));
		throw new Error('Unsupported inference expression');
	};
	return walk(ast);
}

// Keep the source sampled universe plus per-term cut crossings, not a dense analytic envelope.
export function aggregateCurves(
	terms: readonly { curve: SampledCurve; cut: number }[],
): SampledCurve {
	if (!terms.length) throw new InferenceCoverageError('No output terms');
	const base = terms[0].curve.universe;
	const knots = new Set(base);
	for (const { curve, cut } of terms) {
		assertCurve(curve);
		if (
			curve.universe.length !== base.length ||
			curve.universe.some((x, i) => x !== base[i])
		)
			throw new Error('Inconsistent output universe');
		for (const x of cutCrossings(curve, cut)) knots.add(x);
	}
	const universe = [...knots].sort((a, b) => a - b);
	const membership = universe.map((x) =>
		Math.max(
			...terms.map(({ curve, cut }) =>
				Math.min(cut, interpolate(curve, x)),
			),
		),
	);
	const result = { universe, membership };
	assertCurve(result);
	return result;
}

export function inferMamdani(
	rules: readonly NumericRule[],
	scores: ReadonlyMap<string, number>,
): SourceResult {
	if (rules.length > MAX_INFERENCE_RULES)
		throw new Error('Inference source capacity exceeded');
	if (
		rules.some(
			(r) =>
				!MAMDANI_CONFIG.outputs.some(
					(o) =>
						o.category === r.conclusion.category &&
						o.terms.some(
							(t) => t.severity === r.conclusion.severity,
						),
				),
		)
	)
		throw new Error('Unsupported inference conclusion');
	const inputs = fuzzify(scores);
	const results = MAMDANI_CONFIG.outputs.map((definition): CategoryResult => {
		const applicable = rules.filter(
			(r) => r.conclusion.category === definition.category,
		);
		if (!applicable.length)
			throw new InferenceCoverageError('Missing output category');
		const universe = Array.from(
			{ length: definition.maximum + 1 },
			(_, i) => i,
		);
		const curves = definition.terms.map((term) => ({
			...term,
			curve: sampleCurve(term.points, universe),
		}));
		const cuts = new Map<SEVERITY, number>();
		for (const rule of applicable) {
			const firing = evaluateAntecedent(rule.antecedent, inputs);
			cuts.set(
				rule.conclusion.severity,
				Math.max(cuts.get(rule.conclusion.severity) ?? 0, firing),
			);
		}
		const active = curves.flatMap(({ severity, curve }) =>
			cuts.has(severity) ? [{ curve, cut: cuts.get(severity)! }] : [],
		);
		const score = centroid(aggregateCurves(active));
		if (score < 0 || score > definition.maximum)
			throw new Error('Centroid outside configured domain');
		return {
			category: definition.sourceCategory,
			score,
			membership_degrees: Object.fromEntries(
				curves.map(({ label, curve }) => [
					label,
					interpolate(curve, score),
				]),
			) as Record<SourceSeverity, number>,
		};
	});
	return { depression: results[0], anxiety: results[1], stress: results[2] };
}
