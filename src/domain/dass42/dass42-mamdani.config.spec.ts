import {
	MAMDANI_CONFIG,
	CONFIG_HASH,
	ENGINE_VERSION,
} from './dass42-mamdani.config';
import { sampleCurve } from './math/membership';

describe('Immutable original Web numerical configuration', () => {
	it('should retain all fifteen exact source curves and asymmetric domains', () => {
		expect(MAMDANI_CONFIG.outputs.map((o) => o.maximum)).toEqual([
			42, 41, 41,
		]);
		expect(
			MAMDANI_CONFIG.outputs.map((o) =>
				o.terms.map((t) => [...t.points]),
			),
		).toEqual([
			[
				[0, 0, 6, 12],
				[8, 12, 16],
				[12, 18, 24],
				[20, 26, 32],
				[27, 34, 42, 42],
			],
			[
				[0, 0, 7],
				[5, 7, 9],
				[7, 11, 14],
				[12, 16, 19],
				[17, 24, 42, 42],
			],
			[
				[0, 0, 7, 14],
				[11, 14, 18],
				[16, 20, 25],
				[23, 28, 33],
				[31, 36, 42, 42],
			],
		]);
	});
	it('should preserve source labels, shoulders and truncated high tails', () => {
		for (const output of MAMDANI_CONFIG.outputs) {
			expect(output.terms.map((t) => t.label)).toEqual([
				'Normal',
				'Mild',
				'Moderate',
				'Severe',
				'Extremely Severe',
			]);
			const universe = Array.from(
				{ length: output.maximum + 1 },
				(_, i) => i,
			);
			expect(
				sampleCurve(output.terms[0].points, universe).membership[0],
			).toBe(1);
			expect(
				sampleCurve(output.terms[4].points, universe).membership.at(-1),
			).toBe(1);
		}
	});
	it('should expose a version/hash and deeply immutable parameters without clinical approval claims', () => {
		expect(ENGINE_VERSION).toBe('web-mamdani-grid-v1');
		expect(CONFIG_HASH).toMatch(/^[a-f0-9]{64}$/);
		expect(Object.isFrozen(MAMDANI_CONFIG.outputs[0].terms[0].points)).toBe(
			true,
		);
		expect(() =>
			Reflect.set(MAMDANI_CONFIG.outputs[1], 'maximum', 42),
		).not.toThrow();
		expect(MAMDANI_CONFIG.outputs[1].maximum).toBe(41);
	});
});
