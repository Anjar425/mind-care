/**
 * How GlobalExceptionFilter renders errors for a controller (`@ErrorPolicy(...)`):
 * - `auth`: every 5xx becomes a generic 500; 4xx keep their safe message.
 * - `history` / `screening`: `no-store`, and every 4xx message is replaced by a fixed,
 *   area-specific text so that submitted or stored health data never appears in errors.
 * Controllers without a policy use the default rendering of the global instance.
 */
import type { ErrorCode } from '../../../shared/contracts/error-codes';

export type ErrorPolicyName = 'auth' | 'history' | 'screening';

/** Fixed client messages for privacy-redacted areas (4xx only; 5xx use the default body). */
export interface RedactionPolicy {
	messages: Readonly<Record<number, string>>;
	codes: Readonly<Partial<Record<number, ErrorCode>>>;
	fallback: string;
	error: string;
}

export const REDACTION_POLICIES: Readonly<
	Record<Exclude<ErrorPolicyName, 'auth'>, RedactionPolicy>
> = {
	history: {
		messages: {
			400: 'Invalid history request',
			401: 'Authentication required',
			403: 'History access denied',
			404: 'Private history resource not found',
			409: 'History state changed or storage is unavailable for this request; reload before retrying',
			413: 'History request exceeds capacity',
			429: 'Too many requests',
		},
		codes: {
			400: 'HISTORY_INVALID_REQUEST',
			403: 'HISTORY_ACCESS_DENIED',
			404: 'HISTORY_NOT_FOUND',
			409: 'HISTORY_STATE_CHANGED',
			413: 'HISTORY_TOO_LARGE',
		},
		fallback: 'History request rejected',
		error: 'History request rejected',
	},
	screening: {
		messages: {
			400: 'Invalid screening request',
			401: 'Authentication required; supplied credentials were not accepted',
			403: 'Personal screening role required',
			404: 'Screening source unavailable',
			409: 'Screening catalog or source is not ready; reload or select an available source',
			413: 'Screening request exceeds capacity',
			415: 'Uncompressed UTF-8 JSON is required',
			429: 'Too many requests',
		},
		codes: {
			400: 'SCREENING_INVALID_REQUEST',
			403: 'SCREENING_ROLE_REQUIRED',
			404: 'SCREENING_SOURCE_UNAVAILABLE',
			409: 'SCREENING_SOURCE_NOT_READY',
			413: 'SCREENING_TOO_LARGE',
		},
		fallback: 'Screening request rejected',
		error: 'Screening request rejected',
	},
};

const STATUS_CODES: Readonly<Partial<Record<number, ErrorCode>>> = {
	400: 'VALIDATION_FAILED',
	401: 'UNAUTHENTICATED',
	403: 'FORBIDDEN',
	404: 'NOT_FOUND',
	409: 'CONFLICT',
	413: 'PAYLOAD_TOO_LARGE',
	415: 'UNSUPPORTED_MEDIA_TYPE',
	429: 'RATE_LIMITED',
	500: 'INTERNAL_ERROR',
	503: 'UNAVAILABLE',
};

/** Area-specific code for redacted areas, otherwise the generic code for the status. */
export function errorCodeFor(
	status: number,
	area?: keyof typeof REDACTION_POLICIES,
): ErrorCode {
	return (
		(area ? REDACTION_POLICIES[area].codes[status] : undefined) ??
		STATUS_CODES[status] ??
		(status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED')
	);
}
