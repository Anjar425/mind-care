import { createHash } from 'node:crypto';
import type { CATEGORY, LEVEL, SEVERITY } from '../prisma/generated/enums';
import type { SourceCategory } from '../reference-data/reference-data.types';
import type { SourceSeverity } from './dass42-inference.types';

interface OutputDefinition {
	readonly category: CATEGORY;
	readonly sourceCategory: SourceCategory;
	readonly maximum: number;
	readonly terms: readonly {
		readonly severity: SEVERITY;
		readonly label: SourceSeverity;
		readonly points: readonly number[];
	}[];
}

// Immutable source configuration, not a clinically reviewed DASS scoring release.
export const ENGINE_VERSION = 'web-mamdani-grid-v1';
export const MAX_INFERENCE_RULES = 1000;
const configuration = {
	inputUniverse: [0, 1, 2, 3],
	inputTerms: {
		LOW: [0, 0, 1.5],
		MEDIUM: [0.5, 1.5, 2.5],
		HIGH: [1.5, 3, 3],
	},
	outputs: [
		{
			category: 'DEPRESSION',
			sourceCategory: 'depression',
			maximum: 42,
			terms: [
				{ severity: 'NORMAL', label: 'Normal', points: [0, 0, 6, 12] },
				{ severity: 'MILD', label: 'Mild', points: [8, 12, 16] },
				{
					severity: 'MODERATE',
					label: 'Moderate',
					points: [12, 18, 24],
				},
				{ severity: 'SEVERE', label: 'Severe', points: [20, 26, 32] },
				{
					severity: 'EXTREMELY_SEVERE',
					label: 'Extremely Severe',
					points: [27, 34, 42, 42],
				},
			],
		},
		{
			category: 'ANXIETY',
			sourceCategory: 'anxiety',
			maximum: 41,
			terms: [
				{ severity: 'NORMAL', label: 'Normal', points: [0, 0, 7] },
				{ severity: 'MILD', label: 'Mild', points: [5, 7, 9] },
				{
					severity: 'MODERATE',
					label: 'Moderate',
					points: [7, 11, 14],
				},
				{ severity: 'SEVERE', label: 'Severe', points: [12, 16, 19] },
				{
					severity: 'EXTREMELY_SEVERE',
					label: 'Extremely Severe',
					points: [17, 24, 42, 42],
				},
			],
		},
		{
			category: 'STRESS',
			sourceCategory: 'stress',
			maximum: 41,
			terms: [
				{ severity: 'NORMAL', label: 'Normal', points: [0, 0, 7, 14] },
				{ severity: 'MILD', label: 'Mild', points: [11, 14, 18] },
				{
					severity: 'MODERATE',
					label: 'Moderate',
					points: [16, 20, 25],
				},
				{ severity: 'SEVERE', label: 'Severe', points: [23, 28, 33] },
				{
					severity: 'EXTREMELY_SEVERE',
					label: 'Extremely Severe',
					points: [31, 36, 42, 42],
				},
			],
		},
	],
	semantics: {
		input: 'sampled-linear-interpolation',
		and: 'min',
		or: 'max',
		not: 'complement',
		consequentWeight: 1,
		accumulation: 'max',
		implication: 'min-cut',
		outputUniverse: 'original-samples-plus-activation-crossings',
		defuzzification: 'linear-segment-centroid',
		denominatorFloor: Number.EPSILON,
	},
} as const;

// A common readonly view avoids implicit-any callbacks over heterogeneous literal tuples.
export const MAMDANI_CONFIG: {
	readonly inputUniverse: readonly number[];
	readonly inputTerms: Readonly<Record<LEVEL, readonly number[]>>;
	readonly outputs: readonly OutputDefinition[];
	readonly semantics: typeof configuration.semantics;
} = configuration;

function freeze(value: unknown): void {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value as Record<string, unknown>))
			freeze(child);
		Object.freeze(value);
	}
}
freeze(MAMDANI_CONFIG);
export const CONFIG_HASH = createHash('sha256')
	.update(JSON.stringify([ENGINE_VERSION, MAMDANI_CONFIG]))
	.digest('hex');
