import { ScreeningPresentationService } from './screening-presentation.service';
import { screeningPresentation } from './client/screening-presentation';
import { historyDocument } from '../../test/history-mocks';
function levels(
	depression: Record<string, number>,
	anxiety: Record<string, number> = { Moderate: 1 },
	stress: Record<string, number> = { Mild: 1 },
): Record<string, unknown> {
	const entries: [string, Record<string, number>][] = [
		['depression', depression],
		['anxiety', anxiety],
		['stress', stress],
	];
	return Object.fromEntries(
		entries.map(([category, values]) => [
			category,
			{
				category,
				score: 0,
				membership_degrees: {
					Normal: 0,
					Mild: 0,
					Moderate: 0,
					Severe: 0,
					'Extremely Severe': 0,
					...values,
				},
			},
		]),
	);
}
describe('Confirmed DASS42-only presentation policy', () => {
	it('should trigger when D is Severe, A Moderate and S Mild without changing any raw result', () => {
		const result = levels({ Severe: 1 });
		const before = structuredClone(result);
		expect(
			new ScreeningPresentationService().build('DASS42_MAMDANI', result)
				.qualifyingCategories,
		).toEqual(['depression']);
		expect(result).toEqual(before);
	});
	it.each<Record<string, number>>([
		{ Moderate: 0.5, Severe: 0.5 },
		{ Severe: 0.4, 'Extremely Severe': 0.4 },
		{ Normal: 0.5, Severe: 0.5 },
	])('should include a positive tied Severe/Extreme maximum%j', (degrees) => {
		expect(
			screeningPresentation('DASS42_MAMDANI', levels(degrees))
				.consultationRecommended,
		).toBe(true);
	});
	it.each<Record<string, number>>([
		{ Moderate: 0.7, Severe: 0.1 },
		{ Normal: 1 },
		{ Moderate: 0.6, 'Extremely Severe': 0.2 },
		{ Severe: 0, 'Extremely Severe': 0 },
	])(
		'should not trigger from a lower overlap or zero-only tie%j',
		(degrees) => {
			expect(
				screeningPresentation('DASS42_MAMDANI', levels(degrees))
					.consultationRecommended,
			).toBe(false);
		},
	);
	it.each([
		{ score: 28, severe: 2 / 3, extreme: 1 / 7 },
		{ score: 386 / 13, severe: 5 / 13, extreme: 5 / 13 },
		{ score: 31, severe: 1 / 6, extreme: 4 / 7 },
	])(
		'should follow approved source-overlap example at score$score',
		({ severe, extreme }) => {
			expect(
				screeningPresentation(
					'DASS42_MAMDANI',
					levels({ Severe: severe, 'Extremely Severe': extreme }),
				).consultationRecommended,
			).toBe(true);
		},
	);
	it('should use tiny computational tie tolerance rather than rounded display values', () => {
		expect(
			screeningPresentation(
				'DASS42_MAMDANI',
				levels({ Moderate: 0.5, Severe: 0.5 - 1e-13 }),
			).consultationRecommended,
		).toBe(true);
		expect(
			screeningPresentation(
				'DASS42_MAMDANI',
				levels({ Moderate: 0.50001, Severe: 0.5 }),
			).consultationRecommended,
		).toBe(false);
	});
	it('should never show the additional message for any QDSS Copy label', () => {
		for (const label of ['Severe', 'Extremely Severe', null]) {
			const result = {
				...historyDocument().result,
				copyHistoryLabel: label,
			};
			const presentation = screeningPresentation('QDSS_DASS21', result);
			expect(presentation.message).toBeNull();
			expect(presentation.qualifyingCategories).toEqual([]);
			expect(presentation.consultationRecommended).toBe(false);
		}
	});
	it('should reject corrupt DASS42 degrees instead of inventing a severity', () => {
		expect(() => screeningPresentation('DASS42_MAMDANI', {})).toThrow();
		expect(() =>
			screeningPresentation('DASS42_MAMDANI', levels({ Severe: NaN })),
		).toThrow();
	});
});
