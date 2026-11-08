import { SetMetadata } from '@nestjs/common';
import type { RuntimeEnvironment } from '../../../infrastructure/config/environment.config';

type LimitSetting = {
	[K in keyof RuntimeEnvironment]: RuntimeEnvironment[K] extends number
		? K
		: never;
}[keyof RuntimeEnvironment];

export interface RateLimitPolicy {
	/** Per-client-IP limit for this action, on top of the general limit. */
	limit: LimitSetting;
	/** Optional second limit per submitted email address (hashed), whatever the IP. */
	account?: LimitSetting;
	/**
	 * When the shared counter store is unavailable: `true` rejects with 503 (protects
	 * accounts and costly writes), `false` lets the request through (keeps reading alive).
	 */
	failClosed: boolean;
}

/**
 * Action-specific limits applied on top of the general per-IP limit. Handlers sharing an
 * action share one quota (e.g. the three login endpoints).
 */
export const RATE_LIMIT_ACTIONS = {
	login: {
		limit: 'RATE_LIMIT_LOGIN',
		account: 'RATE_LIMIT_LOGIN_ACCOUNT',
		failClosed: true,
	},
	register: { limit: 'RATE_LIMIT_REGISTER', failClosed: true },
	forgot: {
		limit: 'RATE_LIMIT_FORGOT_PASSWORD',
		account: 'RATE_LIMIT_EMAIL_ACCOUNT',
		failClosed: true,
	},
	verification: {
		limit: 'RATE_LIMIT_SEND_VERIFICATION',
		account: 'RATE_LIMIT_EMAIL_ACCOUNT',
		failClosed: true,
	},
	refresh: { limit: 'RATE_LIMIT_REFRESH', failClosed: true },
	'screening-qdss': { limit: 'RATE_LIMIT_SCREENING_QDSS', failClosed: false },
	'screening-dass42': {
		limit: 'RATE_LIMIT_SCREENING_DASS42',
		failClosed: false,
	},
	'credential-upload': {
		limit: 'CREDENTIAL_UPLOAD_RATE_LIMIT',
		failClosed: true,
	},
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitAction = keyof typeof RATE_LIMIT_ACTIONS;

export const RATE_LIMIT_ACTION = 'mindcare:rate-limit-action';

/** Binds the action limit to the handler itself, so renaming a route cannot drop it. */
export const RateLimit = (action: RateLimitAction) =>
	SetMetadata(RATE_LIMIT_ACTION, action);
