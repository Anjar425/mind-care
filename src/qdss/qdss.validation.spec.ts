import {
	digest,
	identifiedScores,
	validateSamples,
	validatePreferences,
} from './qdss.validation';
import { COPY_DEFAULTS } from './qdss.defaults';
describe('QDSS complete samples and fixed reference', () => {
	it('should accept 20 complete defaults and preserve the explicit D13 correction', () => {
		expect(validateSamples(COPY_DEFAULTS.samples)).toHaveLength(20);
		expect(COPY_DEFAULTS.packs[0].preferences[19]).toEqual([20, 70, 10]);
		for (const pack of COPY_DEFAULTS.packs)
			expect(validatePreferences(pack.preferences)).toHaveLength(21);
	});
	it.each([19, 101])('should reject %s samples atomically', (n) =>
		expect(() =>
			validateSamples(
				Array.from({ length: n }, () =>
					Array.from({ length: 21 }, () => 1),
				),
			),
		).toThrow(),
	);
	it.each([-1, 4, 0.5, '1', null, NaN, Infinity, true])(
		'should reject invalid score %s',
		(score) => {
			const samples: unknown[][] = Array.from({ length: 20 }, () =>
				Array.from({ length: 21 }, () => 1),
			);
			samples[0][0] = score;
			expect(() => validateSamples(samples)).toThrow();
		},
	);
	it('should reject original 90-total typo without normalization', () => {
		const prefs = structuredClone(COPY_DEFAULTS.packs[0].preferences);
		prefs[19] = [10, 60, 20];
		expect(() => validatePreferences(prefs)).toThrow();
	});
	it('should bind JSON content independent of jsonb object key order', () =>
		expect(digest({ b: 2, a: [{ z: 3, c: 4 }] })).toBe(
			digest({ a: [{ c: 4, z: 3 }], b: 2 }),
		));
	it('should reject duplicate identified answers', () => {
		const ids = Array.from({ length: 21 }, (_, i) => `Q${i}`);
		const rows = ids.map((dass21Id) => ({ dass21Id, score: 1 }));
		rows[20] = rows[0];
		expect(() => identifiedScores(rows, ids)).toThrow();
	});
});
