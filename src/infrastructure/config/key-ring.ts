/** One entry of a key ring. The first entry signs/seals; every entry verifies/opens. */
export interface RingKey {
	kid: string;
	secret: string;
}

/** Key id used for the single legacy secret and for data written before key ids existed. */
export const LEGACY_KID = 'k0';

const KID = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * Parses `kid:secret,kid:secret` (first = current). Returns undefined when the value is
 * malformed, a key id repeats, or a secret fails `valid`. Secrets cannot contain commas.
 */
export function parseKeyRing(
	value: unknown,
	valid: (secret: string) => boolean,
): RingKey[] | undefined {
	if (typeof value !== 'string' || /[\r\n\0]/.test(value)) return undefined;
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (entries.length === 0) return undefined;
	const ring: RingKey[] = [];
	for (const entry of entries) {
		const separator = entry.indexOf(':');
		if (separator <= 0) return undefined;
		const kid = entry.slice(0, separator);
		const secret = entry.slice(separator + 1);
		if (!KID.test(kid) || !valid(secret) || ring.some((k) => k.kid === kid))
			return undefined;
		ring.push({ kid, secret });
	}
	return ring;
}

/** The key for `kid`; data without a key id belongs to LEGACY_KID. */
export function findKey(
	ring: readonly RingKey[],
	kid: string | undefined,
): RingKey | undefined {
	return ring.find((key) => key.kid === (kid ?? LEGACY_KID));
}
