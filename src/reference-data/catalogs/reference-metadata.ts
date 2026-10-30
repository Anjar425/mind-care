import { CATEGORY, SEVERITY } from '../../prisma/generated/enums';
import type {
	ReferenceConclusion,
	SourceCategory,
} from '../reference-data.types';

// Technical release identity; this is not an approved clinical translation version.
export const CATALOG_VERSION = 'prototype-candidate-v1';
export const SOURCE_CATEGORY_MAP: Readonly<Record<SourceCategory, CATEGORY>> =
	Object.freeze({
		depression: CATEGORY.DEPRESSION,
		anxiety: CATEGORY.ANXIETY,
		stress: CATEGORY.STRESS,
	});
export const REFERENCE_CATEGORIES: readonly CATEGORY[] = Object.freeze([
	CATEGORY.DEPRESSION,
	CATEGORY.ANXIETY,
	CATEGORY.STRESS,
]);
// These levels belong to DASS42; QDSS does not produce severity classifications.
export const DASS42_SEVERITIES: readonly SEVERITY[] = Object.freeze([
	SEVERITY.NORMAL,
	SEVERITY.MILD,
	SEVERITY.MODERATE,
	SEVERITY.SEVERE,
	SEVERITY.EXTREMELY_SEVERE,
]);
export const REFERENCE_CONCLUSIONS: readonly ReferenceConclusion[] =
	Object.freeze(
		REFERENCE_CATEGORIES.flatMap((category) =>
			DASS42_SEVERITIES.map((severity) =>
				Object.freeze({ category, severity }),
			),
		),
	);
