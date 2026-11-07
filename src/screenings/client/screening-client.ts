import type { PrivateHistoryClient } from '../../history/client/history-client';
import { validateHistoryDocument } from '../../history/client/history-document';
import type {
	Dass42Screening,
	QdssScreening,
	ScreeningResponse,
} from '../screening.types';
export interface ScreeningApiRequest {
	(method: 'POST', path: string, body: unknown): Promise<{ data: unknown }>;
}
type HistoryTarget = Pick<
	PrivateHistoryClient,
	'accountId' | 'saveSuccessfulScreening'
>;
function invalid(): never {
	throw new Error('Screening response unavailable');
}
function response(
	value: unknown,
	input: QdssScreening | Dass42Screening,
	instrument: ScreeningResponse['instrument'],
) {
	const keys = [
		'instrument',
		'audience',
		'accountId',
		'assessedAt',
		'context',
		'result',
		'disclaimer',
		'presentation',
	];
	if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
	const r = value as Record<string, unknown>;
	if (
		Object.keys(r).length !== keys.length ||
		keys.some((k) => !Object.hasOwn(r, k)) ||
		r.instrument !== instrument ||
		!['GUEST', 'ACCOUNT'].includes(r.audience as string)
	)
		invalid();
	if (
		r.audience === 'GUEST'
			? r.accountId !== null
			: typeof r.accountId !== 'string' ||
				!r.accountId.length ||
				r.accountId.length > 128
	)
		invalid();
	const qdss = instrument === 'QDSS_DASS21';
	const document: unknown = {
		schemaVersion: 2,
		instrument,
		assessedAt: r.assessedAt,
		context: r.context,
		result: r.result,
		disclaimer: r.disclaimer,
		presentation: r.presentation,
		answers: qdss
			? (input as QdssScreening).answers.map((a) => ({
					questionId: a.dass21Id,
					score: a.score,
				}))
			: (input as Dass42Screening).answers.map((a) => ({
					questionId: a.dass42Id,
					score: a.score,
				})),
	};
	validateHistoryDocument(document);
	const scope = qdss ? (input as QdssScreening).scope : 'GROUP';
	if (
		document.context.scope !== scope ||
		document.context.catalogVersion !== input.catalogVersion ||
		(scope === 'GROUP' && document.context.group?.id !== input.groupId)
	)
		invalid();
	return { screening: r as unknown as ScreeningResponse, document };
}
export class ScreeningClient {
	constructor(
		private readonly request: ScreeningApiRequest,
		private readonly history?: HistoryTarget,
	) {}
	private async submit(
		input: QdssScreening | Dass42Screening,
		instrument: ScreeningResponse['instrument'],
	) {
		const accepted = structuredClone(input);
		const received = await this.request(
			'POST',
			instrument === 'QDSS_DASS21'
				? '/screenings/qdss'
				: '/screenings/dass42',
			accepted,
		);
		const { screening, document } = response(
			received.data,
			accepted,
			instrument,
		);
		if (screening.audience === 'GUEST')
			return {
				screening,
				history: {
					saved: false as const,
					reason: 'GUEST_NO_SAVE' as const,
				},
			};
		if (!this.history)
			return {
				screening,
				history: {
					saved: false as const,
					reason: 'CLIENT_NOT_CONFIGURED' as const,
				},
			};
		if (this.history.accountId() !== screening.accountId)
			return {
				screening,
				history: {
					saved: false as const,
					reason: 'ACCOUNT_CHANGED' as const,
				},
			};
		try {
			return {
				screening,
				history: await this.history.saveSuccessfulScreening(document),
			};
		} catch {
			return {
				screening,
				history: {
					saved: false as const,
					reason: 'UNCONFIRMED' as const,
				},
			};
		}
	}
	qdss(input: QdssScreening) {
		return this.submit(input, 'QDSS_DASS21');
	}
	dass42(input: Dass42Screening) {
		return this.submit(input, 'DASS42_MAMDANI');
	}
}
