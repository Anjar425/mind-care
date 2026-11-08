/**
 * Machine-readable `code` carried by every error response. Clients branch on the code, never
 * on `message` text (messages are for people and may be reworded).
 */
export const ERROR_CODES = {
	VALIDATION_FAILED: 'The body, query or path parameters were rejected',
	UNAUTHENTICATED: 'Missing, expired or invalid credentials',
	FORBIDDEN: 'Authenticated, but not allowed to perform this operation',
	NOT_FOUND: 'The resource or route does not exist for this caller',
	CONFLICT: 'The resource changed concurrently or is in a conflicting state',
	PAYLOAD_TOO_LARGE: 'The request body exceeds the accepted size',
	UNSUPPORTED_MEDIA_TYPE:
		'Only uncompressed UTF-8 JSON (or the documented upload type) is accepted',
	RATE_LIMITED: 'Too many requests; retry after the Retry-After seconds',
	REQUEST_REJECTED: 'The request was rejected for another client-side reason',
	INTERNAL_ERROR: 'Unexpected server failure; no details are disclosed',
	UNAVAILABLE: 'A dependency is temporarily unavailable; retry later',
	HISTORY_INVALID_REQUEST: 'The private history request was rejected',
	HISTORY_ACCESS_DENIED: 'A personal USER or EXPERT account is required',
	HISTORY_NOT_FOUND: 'The private history resource does not exist',
	HISTORY_STATE_CHANGED:
		'The vault changed or storage is unavailable; reload before retrying',
	HISTORY_TOO_LARGE: 'The private history request exceeds capacity',
	SCREENING_INVALID_REQUEST: 'The screening request was rejected',
	SCREENING_ROLE_REQUIRED:
		'Screening with an account requires a USER or EXPERT role',
	SCREENING_SOURCE_UNAVAILABLE:
		'The selected screening source is not available',
	SCREENING_SOURCE_NOT_READY:
		'The catalog or source is not ready; reload or choose another source',
	SCREENING_TOO_LARGE: 'The screening request exceeds capacity',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const isErrorCode = (value: unknown): value is ErrorCode =>
	typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);
