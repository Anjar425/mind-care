export type Triple = [number, number, number];
export type Sample = number[];
export interface Contributor {
	id: string;
	preferences: Triple[];
	provenance: unknown;
}
export interface QdssSnapshot {
	scope: 'GLOBAL' | 'GROUP';
	configurationId: string;
	groupId: number | null;
	catalogVersion: string;
	datasetId: string;
	datasetHash: string;
	referenceId: string | null;
	parameters: Readonly<Record<string, number>>;
	contributors: Contributor[];
}
export interface QdssOutput {
	weights: number[];
	consensus: Triple[];
}

// Inputs accepted by the QDSS domain. HTTP DTOs implement these shapes.

export interface QdssAnswerInput {
	dass21Id: string;
	score: number;
}

export interface QdssSampleInput {
	answers: QdssAnswerInput[];
}

export interface QdssDatasetInput {
	catalogVersion: string;
	expectedStateHash: string;
	samples: QdssSampleInput[];
}

export interface QdssPageFilter {
	page: number;
	limit: number;
	revisionId?: string;
}
