export const GUIDANCE_VERSION = 'dass42-dominant-severe-v1';
export const GUIDANCE_TOLERANCE = 1e-12;
export const CONSULTATION_MESSAGE =
	'Consider speaking with a qualified mental health professional about these screening results. This screening does not establish a diagnosis.';
export type ScreeningCategory = 'depression' | 'anxiety' | 'stress';
export const SCREENING_CATEGORIES = [
	'depression',
	'anxiety',
	'stress',
] as const;
export interface ScreeningPresentation {
	version: typeof GUIDANCE_VERSION;
	consultationRecommended: boolean;
	qualifyingCategories: ScreeningCategory[];
	message: string | null;
}
// Presentation only. Do not change source scores, memberships, labels or numerical configuration.
export function screeningPresentation(
	instrument: 'QDSS_DASS21' | 'DASS42_MAMDANI',
	result: Record<string, unknown>,
): ScreeningPresentation {
	const qualifyingCategories: ScreeningCategory[] = [];
	if (instrument === 'DASS42_MAMDANI')
		for (const category of SCREENING_CATEGORIES) {
			const r = result[category];
			if (!r || typeof r !== 'object' || !('membership_degrees' in r))
				throw new Error('Invalid screening presentation source');
			const degrees = r.membership_degrees;
			if (!degrees || typeof degrees !== 'object')
				throw new Error('Invalid screening presentation source');
			const d = degrees as Record<string, unknown>;
			const levels = [
				'Normal',
				'Mild',
				'Moderate',
				'Severe',
				'Extremely Severe',
			];
			if (
				Object.keys(d).length !== 5 ||
				levels.some(
					(k) =>
						typeof d[k] !== 'number' ||
						!Number.isFinite(d[k]) ||
						d[k] < 0 ||
						d[k] > 1,
				)
			)
				throw new Error('Invalid screening presentation source');
			const maximum = Math.max(...levels.map((k) => d[k] as number));
			if (
				['Severe', 'Extremely Severe'].some(
					(level) =>
						(d[level] as number) > 0 &&
						maximum - (d[level] as number) <= GUIDANCE_TOLERANCE,
				)
			)
				qualifyingCategories.push(category);
		}
	const consultationRecommended = qualifyingCategories.length > 0;
	return {
		version: GUIDANCE_VERSION,
		consultationRecommended,
		qualifyingCategories,
		message: consultationRecommended ? CONSULTATION_MESSAGE : null,
	};
}
