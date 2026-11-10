import type { Request } from 'express';
import { findKey, type RingKey } from '../../../infrastructure/config/key-ring';

/** `kid` from a compact JWS header, or undefined (tokens issued before key ids existed). */
export function kidOf(rawJwt: string): string | undefined {
	try {
		const header: unknown = JSON.parse(
			Buffer.from(rawJwt.split('.')[0] ?? '', 'base64url').toString(
				'utf8',
			),
		);
		return typeof header === 'object' &&
			header !== null &&
			'kid' in header &&
			typeof header.kid === 'string'
			? header.kid
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * passport-jwt `secretOrKeyProvider` for a key ring: picks the key named by the token's
 * `kid` (no `kid` → `k0`). An unknown key id fails authentication (401).
 */
export function ringKeyProvider(ring: readonly RingKey[]) {
	return (
		_request: Request,
		rawJwt: string,
		done: (error: Error | null, secret?: string) => void,
	): void => {
		const key = findKey(ring, kidOf(rawJwt));
		if (key) done(null, key.secret);
		else done(new Error('Unknown signing key'));
	};
}
