import { assertCurve, type SampledCurve } from './membership';

export class InferenceCoverageError extends Error {}

export function centroid(curve: SampledCurve): number {
	assertCurve(curve);
	let area = 0,
		momentArea = 0;
	for (let i = 1; i < curve.universe.length; i++) {
		const x0 = curve.universe[i - 1],
			x1 = curve.universe[i];
		const y0 = curve.membership[i - 1],
			y1 = curve.membership[i];
		if (y0 === 0 && y1 === 0) continue;
		const width = x1 - x0;
		let segmentArea: number, moment: number;
		if (y0 === y1) {
			segmentArea = width * y0;
			moment = (x0 + x1) / 2;
		} else if (y0 === 0) {
			segmentArea = 0.5 * width * y1;
			moment = x0 + (2 / 3) * width;
		} else if (y1 === 0) {
			segmentArea = 0.5 * width * y0;
			moment = x0 + width / 3;
		} else {
			segmentArea = 0.5 * width * (y0 + y1);
			moment = ((2 / 3) * width * (y1 + 0.5 * y0)) / (y0 + y1) + x0;
		}
		area += segmentArea;
		momentArea += moment * segmentArea;
	}
	if (!(area > 0))
		throw new InferenceCoverageError('No positive aggregate area');
	const score = momentArea / Math.max(area, Number.EPSILON);
	if (!Number.isFinite(score) || !Number.isFinite(area))
		throw new Error('Invalid centroid');
	return score;
}
