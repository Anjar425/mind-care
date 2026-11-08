import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { HistoryService } from '../../src/domain/history/history.service';
import { HistoryVaultService } from '../../src/domain/history/history-vault.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { base64url, createPrisma, createUser, resetData } from './support';

describe('Private history vault on PostgreSQL', () => {
	let prisma: PrismaService;
	let vaults: HistoryVaultService;
	let history: HistoryService;

	beforeAll(() => {
		prisma = createPrisma();
		vaults = new HistoryVaultService(prisma);
		history = new HistoryService(prisma, vaults);
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	async function consentedVault() {
		const user = await createUser(prisma);
		const vaultId = randomUUID();
		await vaults.initialize(user.id, {
			vaultId,
			envelopeVersion: 1,
			recoveryVersion: 1,
			recoveryNonce: base64url(12),
			recoveryCiphertext: base64url(48),
		});
		await vaults.consent(user.id, {
			expectedVaultRevision: 0,
			enabled: true,
		});
		return { user, vaultId };
	}

	const entry = (
		vaultId: string,
		expectedVaultRevision: number,
		nonce = base64url(12),
	) => ({
		expectedVaultRevision,
		vaultId,
		keyEpoch: 1,
		envelopeVersion: 1,
		nonce,
		ciphertext: base64url(64),
	});

	it('D8: two saves against the same vault revision cannot both succeed', async () => {
		const { user, vaultId } = await consentedVault();

		const results = await Promise.allSettled([
			history.save(user.id, randomUUID(), entry(vaultId, 1)),
			history.save(user.id, randomUUID(), entry(vaultId, 1)),
		]);

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const failure = results.find(
			(r): r is PromiseRejectedResult => r.status === 'rejected',
		);
		expect(failure?.reason).toBeInstanceOf(ConflictException);
		expect(await prisma.historyEntry.count()).toBe(1);
		const vault = await prisma.historyVault.findUniqueOrThrow({
			where: { userId: user.id },
		});
		expect(vault.revision).toBe(2);
	});

	it('D8: a reused nonce within one vault and key epoch is rejected by the unique constraint', async () => {
		const { user, vaultId } = await consentedVault();
		const nonce = base64url(12);
		await history.save(user.id, randomUUID(), entry(vaultId, 1, nonce));

		await expect(
			history.save(user.id, randomUUID(), entry(vaultId, 2, nonce)),
		).rejects.toThrow(ConflictException);
		expect(await prisma.historyEntry.count()).toBe(1);
	});

	it('D8: delete-all removes entries but keeps the vault, keys and consent', async () => {
		const { user, vaultId } = await consentedVault();
		await history.save(user.id, randomUUID(), entry(vaultId, 1));
		await history.save(user.id, randomUUID(), entry(vaultId, 2));

		await expect(
			history.removeAll(user.id, { expectedVaultRevision: 3 }),
		).resolves.toEqual({ vaultRevision: 4 });

		expect(await prisma.historyEntry.count()).toBe(0);
		const vault = await prisma.historyVault.findUniqueOrThrow({
			where: { userId: user.id },
		});
		expect(vault.storageConsent).toBe(true);
		expect(vault.recoveryVersion).toBe(1);
		expect(vault.revision).toBe(4);
	});
});
