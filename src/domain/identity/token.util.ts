import * as crypto from 'crypto';

/**
 * Generate a random token using crypto.randomBytes
 * @returns hex string token
 */
export function generateToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256
 * @param token raw token string
 * @returns hashed token
 */
export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}
