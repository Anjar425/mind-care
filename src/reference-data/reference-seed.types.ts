import type {
	ReferenceConclusion,
	StoredQuestion,
} from './reference-data.types';

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
