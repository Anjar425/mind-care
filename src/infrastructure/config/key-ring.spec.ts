import { findKey, LEGACY_KID, parseKeyRing } from './key-ring';

const long = (char: string) => char.repeat(32);
const valid = (secret: string) => secret.length >= 32;

describe('parseKeyRing', () => {
	it('should keep order (first entry signs) and allow colons inside a secret', () => {
		expect(
			parseKeyRing(`k2:${long('b')}, k1:${long('a')}:x`, valid),
		).toEqual([
			{ kid: 'k2', secret: long('b') },
			{ kid: 'k1', secret: `${long('a')}:x` },
		]);
	});

	it.each([
		['', 'empty'],
		[`${long('a')}`, 'missing kid'],
		[`:${long('a')}`, 'empty kid'],
		[`k 1:${long('a')}`, 'invalid kid'],
		[`k1:${long('a')},k1:${long('b')}`, 'duplicate kid'],
		['k1:short', 'invalid secret'],
		[`k1:${long('a')}\nk2:${long('b')}`, 'control character'],
	])('should reject %p (%s)', (value) => {
		expect(parseKeyRing(value, valid)).toBeUndefined();
	});
});

describe('findKey', () => {
	const ring = [
		{ kid: 'k1', secret: 'new' },
		{ kid: LEGACY_KID, secret: 'old' },
	];
	it('should resolve by key id and treat a missing id as the legacy key', () => {
		expect(findKey(ring, 'k1')?.secret).toBe('new');
		expect(findKey(ring, undefined)?.secret).toBe('old');
		expect(findKey(ring, 'k9')).toBeUndefined();
	});
});
