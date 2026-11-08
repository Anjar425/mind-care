/**
 * How GlobalExceptionFilter renders errors for a controller (`@ErrorPolicy(...)`):
 * - `auth`: every 5xx becomes a generic 500; 4xx keep their safe message.
 * - `history` / `screening`: `no-store`, and every 4xx message is replaced by a fixed,
 *   area-specific text so that submitted or stored health data never appears in errors.
 * Controllers without a policy use the default rendering of the global instance.
 */
export type ErrorPolicyName = 'auth' | 'history' | 'screening';

/** Fixed client messages for privacy-redacted areas (4xx only; 5xx use the default body). */
export interface RedactionPolicy {
	messages: Readonly<Record<number, string>>;
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
		fallback: 'Screening request rejected',
		error: 'Screening request rejected',
	},
};
