import {
	validateCatalog,
	validateConclusions,
	CatalogValidationError,
} from './catalog-validator';
import { DASS21_CATALOG } from './catalogs/dass21.catalog';
import { DASS42_CATALOG } from './catalogs/dass42.catalog';
import { REFERENCE_CONCLUSIONS } from './catalogs/reference-metadata';

describe('Reference catalog validation', () => {
	it.each([DASS21_CATALOG, DASS42_CATALOG])(
		'should accept complete candidate content when instrument is $instrument',
		(catalog) => {
			expect(() =>
				validateCatalog(catalog, catalog.instrument),
			).not.toThrow();
			expect(Object.isFrozen(catalog)).toBe(true);
			expect(Object.isFrozen(catalog.questions)).toBe(true);
			expect(catalog.questions.every(Object.isFrozen)).toBe(true);
		},
	);
	it.each([null, {}, { questions: null }, { questions: 'invalid' }])(
		'should reject malformed catalogs when the root is %p',
		(value) => {
			expect(() => validateCatalog(value, 'DASS21')).toThrow(
				CatalogValidationError,
			);
		},
	);
	it.each([
		[{ id: 'DASS42-Q01' }, 'invalid identity'],
		[{ number: 0 }, 'invalid number'],
		[{ number: 1.5 }, 'invalid number'],
		[{ number: '1' }, 'invalid number'],
		[{ text: '  ' }, 'invalid text'],
		[{ text: null }, 'invalid text'],
		[{ text: 'bad\0text' }, 'invalid text'],
		[{ sourceId: 99 }, 'source identity mismatch'],
		[{ category: 'UNKNOWN' }, 'unsupported category'],
		[{ sourceCategory: 'depression' }, 'invalid category mapping'],
		[{ sourceCategory: 'unknown' }, 'invalid category mapping'],
	] as const)(
		'should reject invalid question fields when the patch is %p',
		(patch, message) => {
			const catalog = {
				...DASS21_CATALOG,
				questions: [
					{ ...DASS21_CATALOG.questions[0], ...patch },
					...DASS21_CATALOG.questions.slice(1),
				],
			};
			expect(() => validateCatalog(catalog, 'DASS21')).toThrow(message);
		},
	);
	it.each([
		['missing', DASS21_CATALOG.questions.slice(1)],
		['extra', [...DASS21_CATALOG.questions, DASS21_CATALOG.questions[0]]],
		[
			'duplicate',
			[
				DASS21_CATALOG.questions[0],
				DASS21_CATALOG.questions[0],
				...DASS21_CATALOG.questions.slice(2),
			],
		],
		['reordered', [...DASS21_CATALOG.questions].reverse()],
		['non-object', [null, ...DASS21_CATALOG.questions.slice(1)]],
	])(
		'should reject a complete submission when questions are %s',
		(_, questions) => {
			expect(() =>
				validateCatalog({ ...DASS21_CATALOG, questions }, 'DASS21'),
			).toThrow(CatalogValidationError);
		},
	);
	it.each([
		{ instrument: 'DASS42' },
		{ catalogVersion: 'unapproved' },
		{ sourceSha256: 'invalid' },
		{ sourcePath: 'other/source.json' },
		{ clinicalReviewStatus: 'approved' },
		{ licenseStatus: 'verified' },
	])('should reject unsupported metadata when the patch is %p', (patch) => {
		expect(() =>
			validateCatalog({ ...DASS21_CATALOG, ...patch }, 'DASS21'),
		).toThrow(CatalogValidationError);
	});
	it('should reject category drift when source mappings no longer match original counts', () => {
		const questions = DASS21_CATALOG.questions.map((question, index) =>
			index
				? question
				: {
						...question,
						category: 'DEPRESSION',
						sourceCategory: 'depression',
					},
		);
		expect(() =>
			validateCatalog({ ...DASS21_CATALOG, questions }, 'DASS21'),
		).toThrow('category counts');
	});
	it('should preserve original input when validation fails', () => {
		const input = {
			...DASS21_CATALOG,
			questions: [
				{ ...DASS21_CATALOG.questions[0], text: ' \t ' },
				...DASS21_CATALOG.questions.slice(1),
			],
		};
		const before = JSON.stringify(input);
		expect(() => validateCatalog(input, 'DASS21')).toThrow();
		expect(JSON.stringify(input)).toBe(before);
	});
	it('should accept all fifteen conclusion pairs when each category and severity is represented', () => {
		expect(() => validateConclusions(REFERENCE_CONCLUSIONS)).not.toThrow();
	});
	it.each([
		null,
		{},
		[null],
		[],
		REFERENCE_CONCLUSIONS.slice(1),
		[REFERENCE_CONCLUSIONS[0], ...REFERENCE_CONCLUSIONS.slice(0, 14)],
		[
			{ category: 'UNKNOWN', severity: 'MILD' },
			...REFERENCE_CONCLUSIONS.slice(1),
		],
		[
			{ category: 'ANXIETY', severity: 'UNKNOWN' },
			...REFERENCE_CONCLUSIONS.slice(1),
		],
	])(
		'should reject invalid conclusions when the submitted set is %p',
		(value) => {
			expect(() => validateConclusions(value)).toThrow(
				CatalogValidationError,
			);
		},
	);
});
