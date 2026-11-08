import { SetMetadata } from '@nestjs/common';
import type { RuntimeEnvironment } from '../../../infrastructure/config/environment.config';

/**
 * Action-specific limits applied on top of the general per-IP limit. Handlers sharing an
 * action share one quota (e.g. the three login endpoints).
 */
export const RATE_LIMIT_ACTIONS = {
	login: 'RATE_LIMIT_LOGIN',
	register: 'RATE_LIMIT_REGISTER',
	forgot: 'RATE_LIMIT_FORGOT_PASSWORD',
	verification: 'RATE_LIMIT_SEND_VERIFICATION',
	refresh: 'RATE_LIMIT_REFRESH',
	'screening-qdss': 'RATE_LIMIT_SCREENING_QDSS',
	'screening-dass42': 'RATE_LIMIT_SCREENING_DASS42',
	'credential-upload': 'CREDENTIAL_UPLOAD_RATE_LIMIT',
} as const satisfies Record<string, keyof RuntimeEnvironment>;

export type RateLimitAction = keyof typeof RATE_LIMIT_ACTIONS;

export const RATE_LIMIT_ACTION = 'mindcare:rate-limit-action';

/** Binds the action limit to the handler itself, so renaming a route cannot drop it. */
export const RateLimit = (action: RateLimitAction) =>
	SetMetadata(RATE_LIMIT_ACTION, action);
