import {
	sampleCurve,
	interpolate,
	cutCrossings,
	assertCurve,
} from './membership';

describe('Sampled source membership and fractional interpolation', () => {
	it('should retain the sampled medium plateau instead of inserting an analytic peak', () => {
		const medium = sampleCurve([0.5, 1.5, 2.5], [0, 1, 2, 3]);
		expect(medium.membership).toEqual([0, 0.5, 0.5, 0]);
		expect(interpolate(medium, 1.5)).toBe(0.5);
		expect(interpolate(medium, 0.1)).toBe(0.05);
		expect(interpolate(medium, 2.75)).toBe(0.125);
	});
	it.each([
		[[0, 0, 1.5], [1, 1 / 3, 0, 0], 1 / 6],
		[[1.5, 3, 3], [0, 0, 1 / 3, 1], 1 / 6],
	] as const)(
		'should preserve shoulder samples and interpolation for %j',
		(points, expected, midpoint) => {
			const curve = sampleCurve(points, [0, 1, 2, 3]);
			expect(curve.membership).toEqual(expected);
			expect(interpolate(curve, 1.5)).toBeCloseTo(midpoint, 14);
		},
	);
	it('should keep trapezoid shoulders and original sampled domain endpoints', () => {
		const curve = sampleCurve([0, 0, 2, 4], [0, 1, 2, 3, 4]);
		expect(curve.membership).toEqual([1, 1, 1, 0.5, 0]);
		expect(interpolate(curve, -0.1)).toBe(0);
		expect(interpolate(curve, 4.1)).toBe(0);
		expect(interpolate(curve, 3.5)).toBe(0.25);
	});
	it('should handle fully coincident triangle and trapezoid shoulders without division by zero', () => {
		for (const points of [
			[1, 1, 1],
			[1, 1, 1, 1],
		])
			expect(sampleCurve(points, [0, 1, 2]).membership).toEqual([
				0, 1, 0,
			]);
	});
	it('should add fractional cut intersections and preserve source zero/peak predicates', () => {
		const curve = sampleCurve([0, 2, 4], [0, 1, 2, 3, 4]);
		expect(cutCrossings(curve, 0.25)).toEqual([0.5, 3.5]);
		expect(cutCrossings(curve, 0)).toEqual([0, 4]);
		expect(cutCrossings(curve, 1)).toEqual([2, 2]);
	});
	it('should not add arbitrary knots along a plateau', () => {
		expect(
			cutCrossings(sampleCurve([0, 1, 3, 4], [0, 1, 2, 3, 4]), 1),
		).toEqual([1, 3]);
	});
	it.each([
		{ points: [2, 1, 3] },
		{ points: [0, NaN, 1] },
		{ points: [0, 1] },
		{ points: [0, 1, 2, Infinity] },
	])('should reject invalid curve parameters %j', ({ points }) => {
		expect(() => sampleCurve(points, [0, 1, 2, 3])).toThrow();
	});
	it.each([
		{ universe: [0, 0], membership: [0, 1] },
		{ universe: [0, 1], membership: [0] },
		{ universe: [0, Infinity], membership: [0, 1] },
		{ universe: [0, 1], membership: [0, 1.1] },
		{ universe: [0, 1], membership: [0, NaN] },
	])('should reject invalid sampled data %j', (curve) =>
		expect(() => assertCurve(curve)).toThrow(),
	);
	it('should reject nonfinite inputs/cuts and freeze source-owned samples', () => {
		const curve = sampleCurve([0, 1, 2], [0, 1, 2]);
		for (const cut of [-0.1, 1.1, NaN, Infinity])
			expect(() => cutCrossings(curve, cut)).toThrow();
		expect(() => interpolate(curve, NaN)).toThrow();
		expect(Object.isFrozen(curve.membership)).toBe(true);
		expect(Object.isFrozen(curve.universe)).toBe(true);
	});
});
