import {
	CATALOG_VERSION,
	REFERENCE_CATEGORIES,
	DASS42_SEVERITIES,
	SOURCE_CATEGORY_MAP,
} from './catalogs/reference-metadata';
import type { CATEGORY } from '../prisma/generated/enums';
import type {
	ReferenceCatalog,
	ReferenceConclusion,
	Instrument,
	SourceCategory,
} from './reference-data.types';

export class CatalogValidationError extends Error {
	constructor(readonly issues: readonly string[]) {
		super(`Invalid reference catalog: ${issues.join('; ')}`);
		this.name = 'CatalogValidationError';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCategory(value: unknown): value is CATEGORY {
	return REFERENCE_CATEGORIES.some((category) => category === value);
}

function isSourceCategory(value: unknown): value is SourceCategory {
	return (
		typeof value === 'string' && Object.hasOwn(SOURCE_CATEGORY_MAP, value)
	);
}

export function validateCatalog(
	catalog: unknown,
	expected: Instrument,
): asserts catalog is ReferenceCatalog {
	if (!isRecord(catalog) || !Array.isArray(catalog.questions))
		throw new CatalogValidationError([
			'catalog must contain a question array',
		]);
	const count = expected === 'DASS21' ? 21 : 42;
	const issues: string[] = [];
	if (catalog.instrument !== expected) issues.push('instrument mismatch');
	if (catalog.catalogVersion !== CATALOG_VERSION)
		issues.push('unsupported catalog version');
	if (
		catalog.sourcePath !==
			`app/seeder/data/${expected.toLowerCase()}.json` ||
		typeof catalog.sourceSha256 !== 'string' ||
		!/^[a-f0-9]{64}$/.test(catalog.sourceSha256)
	)
		issues.push('invalid source provenance');
	if (
		catalog.clinicalReviewStatus !== 'unreviewed' ||
		catalog.licenseStatus !== 'unverified'
	)
		issues.push('unsupported review metadata');
	if (catalog.questions.length !== count)
		issues.push(`expected ${count} questions`);
	const ids = new Set<string>();
	const numbers = new Set<number>();
	const categories = new Map(
		REFERENCE_CATEGORIES.map((category) => [category, 0]),
	);
	const questions: unknown[] = catalog.questions;
	for (const [index, question] of questions.entries()) {
		const position = `item ${index + 1}`;
		if (!isRecord(question)) {
			issues.push(`${position}: question must be an object`);
			continue;
		}
		if (
			typeof question.number !== 'number' ||
			!Number.isInteger(question.number) ||
			question.number < 1 ||
			question.number > count ||
			question.number !== index + 1
		)
			issues.push(`${position}: invalid number or source order`);
		if (
			question.id !==
			`${expected}-Q${String(question.number).padStart(2, '0')}`
		)
			issues.push(`${position}: invalid identity`);
		if (
			typeof question.id !== 'string' ||
			typeof question.number !== 'number'
		)
			issues.push(`${position}: invalid identity types`);
		else {
			if (ids.has(question.id) || numbers.has(question.number))
				issues.push(`${position}: duplicate identity`);
			ids.add(question.id);
			numbers.add(question.number);
		}
		if (
			typeof question.text !== 'string' ||
			!question.text.trim() ||
			question.text.includes('\0')
		)
			issues.push(`${position}: invalid text`);
		if (question.sourceId !== question.number)
			issues.push(`${position}: source identity mismatch`);
		if (
			!isSourceCategory(question.sourceCategory) ||
			SOURCE_CATEGORY_MAP[question.sourceCategory] !== question.category
		)
			issues.push(`${position}: invalid category mapping`);
		if (!isCategory(question.category))
			issues.push(`${position}: unsupported category`);
		else
			categories.set(
				question.category,
				categories.get(question.category)! + 1,
			);
	}
	if ([...categories.values()].some((total) => total !== count / 3))
		issues.push('category counts differ from candidate source');
	if (issues.length) throw new CatalogValidationError(issues);
}

export function validateConclusions(
	conclusions: unknown,
): asserts conclusions is readonly ReferenceConclusion[] {
	if (!Array.isArray(conclusions))
		throw new CatalogValidationError(['conclusions must be an array']);
	const issues: string[] = [];
	if (
		conclusions.length !==
		REFERENCE_CATEGORIES.length * DASS42_SEVERITIES.length
	)
		issues.push('expected 15 category/severity pairs');
	const pairs = new Set<string>();
	const items: unknown[] = conclusions;
	for (const [index, conclusion] of items.entries()) {
		if (!isRecord(conclusion)) {
			issues.push(
				`conclusion ${index + 1}: conclusion must be an object`,
			);
			continue;
		}
		if (
			!isCategory(conclusion.category) ||
			typeof conclusion.severity !== 'string' ||
			!DASS42_SEVERITIES.some(
				(severity) => severity === conclusion.severity,
			)
		) {
			issues.push(
				`conclusion ${index + 1}: invalid category or severity`,
			);
			continue;
		}
		const key = `${conclusion.category}:${conclusion.severity}`;
		if (pairs.has(key))
			issues.push(`conclusion ${index + 1}: duplicate pair`);
		pairs.add(key);
	}
	if (issues.length) throw new CatalogValidationError(issues);
}
