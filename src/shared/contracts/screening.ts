import type { HistoryContext, HistoryDocument } from './history-document';
import type { ScreeningPresentation } from './screening-presentation';
export const MAX_SCREENING_REQUEST_BYTES = 16384;
export interface QdssScreening {
	catalogVersion: string;
	scope: 'GLOBAL' | 'GROUP';
	groupId?: number;
	answers: { dass21Id: string; score: number }[];
}
export interface Dass42Screening {
	catalogVersion: string;
	groupId: number;
	answers: { dass42Id: string; score: number }[];
}
export interface ScreeningResponse {
	instrument: HistoryDocument['instrument'];
	audience: 'GUEST' | 'ACCOUNT';
	accountId: string | null;
	assessedAt: string;
	context: HistoryContext;
	result: Record<string, unknown>;
	disclaimer: string;
	presentation: ScreeningPresentation;
}
