import type {
	CATEGORY,
	SEVERITY,
} from '../../infrastructure/prisma/generated/enums';

export type Instrument = 'DASS21' | 'DASS42';
export type SourceCategory = 'depression' | 'anxiety' | 'stress';

export interface CatalogQuestion {
	readonly id: string;
	readonly number: number;
	readonly text: string;
	readonly category: CATEGORY;
	readonly sourceId: number;
	readonly sourceCategory: SourceCategory;
}

export interface ReferenceCatalog {
	readonly instrument: Instrument;
	readonly catalogVersion: string;
	readonly sourcePath: string;
	readonly sourceSha256: string;
	readonly clinicalReviewStatus: 'unreviewed';
	readonly licenseStatus: 'unverified';
	readonly questions: readonly CatalogQuestion[];
}

export interface ReferenceConclusion {
	readonly category: CATEGORY;
	readonly severity: SEVERITY;
}

export interface StoredQuestion {
	id: string;
	number: number;
	text: string;
	category: CATEGORY;
	catalogVersion: string;
}

// Questionnaire read model returned by the reference-data domain.
export interface QuestionnaireQuestion {
	id: string;
	number: number;
	text: string;
}

export interface Questionnaire {
	instrument: Instrument;
	catalogVersion: string;
	questions: QuestionnaireQuestion[];
}

export interface StoredConclusion {
	id: number;
	category: ReferenceConclusion['category'];
	severty: ReferenceConclusion['severity'];
}

export interface ReferenceSeedBundle {
	catalogVersion: string;
	catalogDigest: string;
	dass21: StoredQuestion[];
	dass42: StoredQuestion[];
	conclusions: Omit<StoredConclusion, 'id'>[];
}

export interface SeedCollectionSummary {
	expected: number;
	insert: number;
	unchanged: number;
}

export interface SeedConflict {
	collection: 'DASS21' | 'DASS42' | 'Conclusion';
	reason: 'UNEXPECTED_ROWS' | 'DUPLICATE_IDENTITY' | 'CONTENT_MISMATCH';
	questionId?: string;
}

export interface ReferenceSeedReport {
	mode: 'preview' | 'apply';
	catalogVersion: string;
	catalogDigest: string;
	canApply: boolean;
	collections: Record<
		'DASS21' | 'DASS42' | 'Conclusion',
		SeedCollectionSummary
	>;
	conflicts: SeedConflict[];
	inserted: number;
}

export class ReferenceSeedError extends Error {
	constructor(
		readonly code:
			| 'INVALID_CATALOG'
			| 'CONFIGURATION'
			| 'CONFLICT'
			| 'STORAGE_UNAVAILABLE'
			| 'CONCURRENT_CHANGE'
			| 'WRITE_INCOMPLETE',
		message: string,
		readonly report?: ReferenceSeedReport,
	) {
		super(message);
		this.name = 'ReferenceSeedError';
	}
}
