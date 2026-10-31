import {
	BadRequestException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { DASS21_CATALOG } from '../reference-data/catalogs/dass21.catalog';
import type {
	PreferenceCatalog,
	ReplacePreferences,
	StoredPreferenceVector,
} from './expert-preferences.types';

export const PREFERENCE_FIELDS = [
	'percentDepression',
	'percentAnxiety',
	'percentStress',
] as const;
export const CATALOG_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
export const isPercentage = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isSafeInteger(value) &&
	value >= 0 &&
	value <= 100;
export function preferenceQuestionIds(catalog: PreferenceCatalog): Set<string> {
	const ids = new Set(catalog.questions.map((q) => q.id));
	if (catalog.questions.length !== 21 || ids.size !== 21)
		throw new ServiceUnavailableException(
			'Preference reference catalog is unavailable',
		);
	return ids;
}
export function preferenceVectorIssues(
	value: unknown,
	ids: Set<string>,
	position: string,
): string[] {
	if (!isRecord(value)) return [`${position} must be a preference object`];
	const errors: string[] = [];
	if (typeof value.dass21Id !== 'string' || !ids.has(value.dass21Id))
		errors.push(
			`${position}.dass21Id must identify a current DASS21 question`,
		);
	const prefix =
		typeof value.dass21Id === 'string' && ids.has(value.dass21Id)
			? value.dass21Id
			: position;
	for (const key of PREFERENCE_FIELDS)
		if (!isPercentage(value[key]))
			errors.push(`${prefix}.${key} must be an integer from 0 to 100`);
	if (
		PREFERENCE_FIELDS.every((key) => isPercentage(value[key])) &&
		PREFERENCE_FIELDS.reduce(
			(sum, key) => sum + (value[key] as number),
			0,
		) !== 100
	)
		errors.push(
			`${prefix} D/A/S percentages must total exactly 100; values were not adjusted`,
		);
	return errors;
}
// Catalog failure is infrastructure failure; invalid member rows are domain state.
export function storedPreferencesValid(
	catalog: PreferenceCatalog,
	rows: readonly StoredPreferenceVector[],
): boolean {
	const ids = preferenceQuestionIds(catalog);
	const seen = new Set<string>();
	if (rows.length > 21) return false;
	for (const row of rows) {
		if (
			preferenceVectorIssues(row, ids, 'Stored preference').length ||
			seen.has(row.dass21Id) ||
			typeof row.catalogVersion !== 'string' ||
			!CATALOG_VERSION_PATTERN.test(row.catalogVersion)
		)
			return false;
		seen.add(row.dass21Id);
	}
	return true;
}
export function assertPreferencesSubmission(
	input: unknown,
	catalog: PreferenceCatalog = DASS21_CATALOG,
): asserts input is ReplacePreferences {
	if (!isRecord(input))
		throw new BadRequestException(
			'A complete preference submission is required',
		);
	const errors: string[] = [];
	for (const key of Object.keys(input))
		if (
			!['catalogVersion', 'expectedStateHash', 'preferences'].includes(
				key,
			)
		)
			errors.push(`${key} is not allowed`);
	if (
		typeof input.catalogVersion !== 'string' ||
		!CATALOG_VERSION_PATTERN.test(input.catalogVersion)
	)
		errors.push('catalogVersion must be a supported release identifier');
	if (
		typeof input.expectedStateHash !== 'string' ||
		!/^[a-f0-9]{64}$/.test(input.expectedStateHash)
	)
		errors.push(
			'expectedStateHash must be the SHA-256 state returned by GET',
		);
	if (!Array.isArray(input.preferences) || input.preferences.length !== 21)
		errors.push('preferences must contain exactly 21 question groups');
	else {
		const ids = preferenceQuestionIds(catalog);
		const seen = new Set<string>();
		const entries: unknown[] = input.preferences;
		entries.forEach((row, index) => {
			const prefix = `preferences[${index}]`;
			errors.push(...preferenceVectorIssues(row, ids, prefix));
			if (!isRecord(row)) return;
			for (const key of Object.keys(row))
				if (!['dass21Id', ...PREFERENCE_FIELDS].includes(key))
					errors.push(`${prefix}.${key} is not allowed`);
			if (typeof row.dass21Id === 'string' && ids.has(row.dass21Id)) {
				if (seen.has(row.dass21Id))
					errors.push(`${row.dass21Id} is duplicated`);
				seen.add(row.dass21Id);
			}
		});
		if (seen.size !== 21)
			errors.push(
				'preferences must cover every current DASS21 question exactly once',
			);
	}
	if (errors.length) throw new BadRequestException(errors);
}
