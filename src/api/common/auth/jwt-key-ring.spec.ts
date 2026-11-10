import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { kidOf, ringKeyProvider } from './jwt-key-ring';

const OLD = 'previous-access-signing-secret-000000000';
const NEW = 'current-access-signing-secret-1111111111';
const ring = [
	{ kid: 'k1', secret: NEW },
	{ kid: 'k0', secret: OLD },
];

function resolve(token: string) {
	return new Promise<{ error: Error | null; secret?: string }>((done) =>
		ringKeyProvider(ring)({} as Request, token, (error, secret) =>
			done({ error, secret }),
		),
	);
}

describe('JWT key ring', () => {
	const jwt = new JwtService({});

	it('should verify a token signed with the current key by its kid', async () => {
		const token = jwt.sign({ sub: 'u' }, { secret: NEW, keyid: 'k1' });
		expect(kidOf(token)).toBe('k1');
		const { secret } = await resolve(token);
		expect(jwt.verify(token, { secret })).toMatchObject({ sub: 'u' });
	});

	it('should keep tokens issued before key ids (no kid) valid with k0', async () => {
		const legacy = jwt.sign({ sub: 'u' }, { secret: OLD });
		expect(kidOf(legacy)).toBeUndefined();
		const { secret } = await resolve(legacy);
		expect(secret).toBe(OLD);
		expect(() => {
			jwt.verify(legacy, { secret });
		}).not.toThrow();
	});

	it('should fail tokens naming a removed or unknown key, and garbage headers', async () => {
		const removed = jwt.sign({ sub: 'u' }, { secret: OLD, keyid: 'k9' });
		expect((await resolve(removed)).error).toBeInstanceOf(Error);
		expect(kidOf('not-a-jwt')).toBeUndefined();
	});
});
