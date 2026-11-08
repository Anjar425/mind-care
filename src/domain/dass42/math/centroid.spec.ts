import { centroid, InferenceCoverageError } from './centroid';

describe('Linear-segment centroid geometry, not discrete point averaging', () => {
	it.each([
		[[0, 2], [1, 1], 1],
		[[0, 6], [1, 0], 2],
		[[0, 6], [0, 1], 4],
		[[0, 6, 12], [1, 1, 0], 14 / 3],
		[[0, 1, 3], [0, 1, 0], 4 / 3],
		[[0, 2], [0.5, 1], 10 / 9],
	] as const)(
		'should integrate universe %j with membership %j',
		(universe, membership, expected) => {
			expect(centroid({ universe, membership })).toBeCloseTo(
				expected,
				12,
			);
		},
	);
	it('should remain invariant under inserting points on the same line', () => {
		expect(
			centroid({ universe: [0, 1, 2], membership: [0.5, 0.75, 1] }),
		).toBeCloseTo(10 / 9, 12);
	});
	it('should preserve the source epsilon denominator for tiny positive areas', () => {
		const height = Number.EPSILON / 4;
		expect(
			centroid({ universe: [0, 1], membership: [height, height] }),
		).toBe(0.125);
		expect(
			centroid({
				universe: [0, 1],
				membership: [Number.MIN_VALUE, Number.MIN_VALUE],
			}),
		).toBe(0);
	});
	it('should reject no activation instead of returning a fabricated normal score', () => {
		expect(() =>
			centroid({ universe: [0, 1, 2], membership: [0, 0, 0] }),
		).toThrow(InferenceCoverageError);
	});
	it('should reject invalid geometry/nonfinite output', () => {
		expect(() =>
			centroid({ universe: [0, 1], membership: [0, Infinity] }),
		).toThrow();
		expect(() =>
			centroid({ universe: [0, Number.MAX_VALUE], membership: [1, 1] }),
		).toThrow();
	});
});
