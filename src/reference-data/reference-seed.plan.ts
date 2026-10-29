import { createHash } from 'node:crypto';
import { DASS21_CATALOG } from './catalogs/dass21.catalog';
import { DASS42_CATALOG } from './catalogs/dass42.catalog';
import {
	CATALOG_VERSION,
	REFERENCE_CONCLUSIONS,
} from './catalogs/reference-metadata';
import {
	CatalogValidationError,
	validateCatalog,
	validateConclusions,
} from './catalog-validator';
import {
	ReferenceSeedError,
	type ReferenceSeedBundle,
} from './reference-seed.types';

export function getReferenceSeedBundle(): ReferenceSeedBundle {
	try {
		validateCatalog(DASS21_CATALOG, 'DASS21');
		validateCatalog(DASS42_CATALOG, 'DASS42');
		validateConclusions(REFERENCE_CONCLUSIONS);
	} catch (error: unknown) {
		throw new ReferenceSeedError(
			'INVALID_CATALOG',
			error instanceof CatalogValidationError
				? error.message
				: 'Reference catalog validation failed',
		);
	}
	const questions = (catalog: typeof DASS21_CATALOG) =>
		catalog.questions.map(({ id, number, text, category }) => ({
			id,
			number,
			text,
			category,
			catalogVersion: catalog.catalogVersion,
		}));
	const data = {
		catalogVersion: CATALOG_VERSION,
		dass21: questions(DASS21_CATALOG),
		dass42: questions(DASS42_CATALOG),
		conclusions: REFERENCE_CONCLUSIONS.map(({ category, severity }) => ({
			category,
			severty: severity,
		})),
	};
	const catalogDigest = createHash('sha256')
		.update(
			JSON.stringify({
				...data,
				sources: [
					DASS21_CATALOG.sourceSha256,
					DASS42_CATALOG.sourceSha256,
				],
			}),
		)
		.digest('hex');
	return { ...data, catalogDigest };
}

export function getReferenceSeedManifest() {
	const bundle = getReferenceSeedBundle();
	return {
		mode: 'catalog-only' as const,
		storageChecked: false,
		catalogVersion: bundle.catalogVersion,
		catalogDigest: bundle.catalogDigest,
		clinicalReviewStatus: 'unreviewed',
		licenseStatus: 'unverified',
		expected: {
			DASS21: bundle.dass21.map((row) => row.id),
			DASS42: bundle.dass42.map((row) => row.id),
			Conclusion: bundle.conclusions.length,
		},
	};
}
