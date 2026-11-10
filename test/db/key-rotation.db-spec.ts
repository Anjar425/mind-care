import { randomUUID } from 'node:crypto';
import { CredentialKeyRotationService } from '../../src/domain/credentials/credential-key-rotation.service';
import { CredentialStorageService } from '../../src/domain/credentials/credential-storage.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { ObjectStore } from '../../src/infrastructure/storage/object-store';
import { createTestS3Store } from './object-storage';
import { createPrisma, createUser, dbConfig, resetData } from './support';

const OLD = 'a'.repeat(64);
const NEW = 'c'.repeat(64);
const ring = (keys: [string, string][]) =>
	dbConfig({
		CREDENTIAL_ENCRYPTION_KEY: keys[0][1],
		CREDENTIAL_ENCRYPTION_KEYS: keys.map(([kid, secret]) => ({
			kid,
			secret,
		})),
	});

// Rotation drill: data sealed with k0 (including the pre-key-id format) is moved to k1 in
// place, after which k0 can leave the ring. Documents live in a real S3-compatible bucket.
describe('Credential key rotation on PostgreSQL and S3', () => {
	let prisma: PrismaService;
	let store: ObjectStore;
	const before = () =>
		new CredentialStorageService(ring([['k0', OLD]]), store);
	const during = () =>
		new CredentialStorageService(
			ring([
				['k1', NEW],
				['k0', OLD],
			]),
			store,
		);
	const after = () =>
		new CredentialStorageService(ring([['k1', NEW]]), store);

	beforeAll(async () => {
		prisma = createPrisma();
		store = await createTestS3Store();
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	async function revision(purged = false) {
		const user = await createUser(prisma, { role: 'EXPERT' });
		const expert = await prisma.expert.create({
			data: { userId: user.id },
		});
		const identity = await prisma.credentialIdentity.create({
			data: { type: 'STR', lookup: randomUUID(), expertId: expert.id },
		});
		const sealer = before();
		const document = await sealer.put({
			buffer: Buffer.from('%PDF-synthetic credential'),
			size: 25,
			mimetype: 'application/pdf',
		});
		const id = randomUUID();
		const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		await prisma.credentialRevision.create({
			data: {
				id,
				expertId: expert.id,
				identityId: identity.id,
				type: 'STR',
				status: 'APPROVED',
				// Written before key ids existed: plain base64, no `v2.k0.` prefix.
				numberCipher: sealer
					.seal(Buffer.from('STR-0001'), id)
					.slice('v2.k0.'.length),
				holderName: user.name,
				expiresAt,
				expiryDate: expiresAt.toISOString().slice(0, 10),
				objectKey: document.objectKey,
				digest: document.digest,
				mime: document.mime,
				size: document.size,
				reviewedAt: new Date(),
				purgedAt: purged ? new Date() : null,
			},
		});
		return { id, ...document };
	}

	it('3C-4: dry run reports what would move and changes nothing', async () => {
		const row = await revision();
		const report = await new CredentialKeyRotationService(
			prisma,
			during(),
		).reencrypt(false);
		expect(report).toEqual({
			scanned: 1,
			numbers: 1,
			documents: 1,
			failed: 0,
		});
		const stored = await prisma.credentialRevision.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(during().kidOf(stored.numberCipher)).toBe('k0');
		expect(await during().sealedKid(row.objectKey)).toBe('k0');
	});

	it('3C-4: re-seals numbers and documents, is idempotent, and lets k0 be retired', async () => {
		const row = await revision();
		await revision(true);
		const rotation = new CredentialKeyRotationService(prisma, during());
		expect(await rotation.reencrypt(true)).toEqual({
			scanned: 2,
			numbers: 2,
			documents: 1,
			failed: 0,
		});
		expect(await rotation.reencrypt(true)).toEqual({
			scanned: 2,
			numbers: 0,
			documents: 0,
			failed: 0,
		});

		const stored = await prisma.credentialRevision.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(stored.numberCipher).toMatch(/^v2\.k1\./);
		// k0 removed from the ring: everything still opens.
		const retired = after();
		expect(retired.open(stored.numberCipher, row.id).toString()).toBe(
			'STR-0001',
		);
		expect(
			(
				await retired.read(row.objectKey, row.digest, row.size)
			).toString(),
		).toBe('%PDF-synthetic credential');
	});
});
