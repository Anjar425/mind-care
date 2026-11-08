export interface SampledCurve {
	readonly universe: readonly number[];
	readonly membership: readonly number[];
}

export function assertCurve(curve: SampledCurve): void {
	if (
		curve.universe.length < 2 ||
		curve.universe.length !== curve.membership.length ||
		curve.universe.some(
			(x, i, xs) => !Number.isFinite(x) || (i > 0 && x <= xs[i - 1]),
		) ||
		curve.membership.some((y) => !Number.isFinite(y) || y < 0 || y > 1)
	)
		throw new Error('Invalid sampled membership configuration');
}

function triangle(x: number, a: number, b: number, c: number): number {
	if (x === b) return 1;
	if (a < x && x < b) return (x - a) / (b - a);
	if (b < x && x < c) return (c - x) / (c - b);
	return 0;
}

export function sampleCurve(
	points: readonly number[],
	universe: readonly number[],
): SampledCurve {
	if (
		(points.length !== 3 && points.length !== 4) ||
		points.some(
			(v, i) => !Number.isFinite(v) || (i > 0 && v < points[i - 1]),
		)
	)
		throw new Error('Invalid triangular/trapezoidal configuration');
	const [a, b, c, d] = points;
	const membership = universe.map((x) => {
		if (points.length === 3) return triangle(x, a, b, c);
		if (x < b) return triangle(x, a, b, b);
		if (x > c) return triangle(x, c, c, d);
		return 1;
	});
	const curve = {
		universe: Object.freeze([...universe]),
		membership: Object.freeze(membership),
	};
	assertCurve(curve);
	return Object.freeze(curve);
}

// Interpolate stored samples. Never reevaluate analytic triangles at a fractional input.
export function interpolate(curve: SampledCurve, x: number): number {
	assertCurve(curve);
	if (!Number.isFinite(x)) throw new Error('Nonfinite interpolation input');
	const { universe: xs, membership: ys } = curve;
	if (x < xs[0] || x > xs[xs.length - 1]) return 0;
	let lo = 0,
		hi = xs.length - 1;
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (x === xs[mid]) return ys[mid];
		if (x < xs[mid]) hi = mid - 1;
		else lo = mid + 1;
	}
	return ys[hi] + ((x - xs[hi]) * (ys[lo] - ys[hi])) / (xs[lo] - xs[hi]);
}

// Source-compatible crossing predicate includes the special zero-cut transition.
export function cutCrossings(curve: SampledCurve, cut: number): number[] {
	assertCurve(curve);
	if (!Number.isFinite(cut) || cut < 0 || cut > 1)
		throw new Error('Invalid activation cut');
	const result: number[] = [];
	for (let i = 0; i < curve.universe.length - 1; i++) {
		const y0 = curve.membership[i],
			y1 = curve.membership[i + 1];
		const left = cut === 0 ? y0 > cut : y0 >= cut;
		const right = cut === 0 ? y1 > cut : y1 >= cut;
		if (left !== right)
			result.push(
				curve.universe[i] +
					((cut - y0) * (curve.universe[i + 1] - curve.universe[i])) /
						(y1 - y0),
			);
	}
	return result;
}
