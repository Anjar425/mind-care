import type { CATEGORY, SEVERITY } from '../prisma/generated/enums';

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
