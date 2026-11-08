import { patientResult, severity } from './result';
import type { Triple } from '../qdss.types';
describe('Copy result and history-label arithmetic', () => {
	it.each([
		[20, 'Normal'],
		[21, 'Mild'],
		[40, 'Mild'],
		[41, 'Moderate'],
		[60, 'Moderate'],
		[61, 'Severe'],
		[80, 'Severe'],
		[81, 'Extremely Severe'],
	] as const)('should map %s to source label %s', (n, label) =>
		expect(severity(n)).toBe(label),
	);
	it('should preserve zero early return without a Normal label', () => {
		expect(
			patientResult(
				Array(21).fill(0) as number[],
				Array.from({ length: 21 }, () => [0.2, 0.7, 0.1] as Triple),
			),
		).toEqual({
			depression: 0,
			anxiety: 0,
			stress: 0,
			copyHistoryLabel: null,
		});
	});
	it('should expose relative composition and the same result under uniform positive answer scaling', () => {
		const matrix = Array.from(
			{ length: 21 },
			() => [0.65, 0.2, 0.15] as Triple,
		);
		const first = patientResult(Array(21).fill(1) as number[], matrix),
			second = patientResult(Array(21).fill(3) as number[], matrix);
		expect(first.depression).toBeCloseTo(second.depression, 12);
		expect(first.copyHistoryLabel).toBe('Severe');
	});
});
