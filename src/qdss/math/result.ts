import type { Triple } from '../qdss.types';
import { pythonRound } from './rounding';
export const severity = (highest: number) =>
	highest <= 20
		? 'Normal'
		: highest <= 40
			? 'Mild'
			: highest <= 60
				? 'Moderate'
				: highest <= 80
					? 'Severe'
					: 'Extremely Severe';
export function patientResult(
	scores: readonly number[],
	matrix: readonly Triple[],
) {
	if (scores.length !== 21 || matrix.length !== 21)
		throw new Error('Invalid result dimensions');
	const totals = [0, 0, 0];
	for (let q = 0; q < 21; q++)
		for (let k = 0; k < 3; k++)
			if (scores[q] > 0) totals[k] += (scores[q] / 3) * matrix[q][k];
	const total = totals.reduce((a, b) => a + b, 0);
	if (total === 0)
		return { depression: 0, anxiety: 0, stress: 0, copyHistoryLabel: null };
	const values = totals.map((v) => v / total);
	return {
		depression: values[0],
		anxiety: values[1],
		stress: values[2],
		copyHistoryLabel: severity(
			Math.max(...values.map((v) => pythonRound(v * 100))),
		),
	};
}
