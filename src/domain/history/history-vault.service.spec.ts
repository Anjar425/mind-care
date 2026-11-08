import {
	historyInit,
	historyMocks,
	historyOther,
	historyOwner,
} from '../../../test/history-mocks';

describe('Owner vault consent and recovery', () => {
	it('should initialize opt-out and reject an existing vault without replacing keys', async () => {
		const f = historyMocks();
		const v = await f.vaultService.initialize(historyOwner, historyInit());
		expect(v.storageConsent).toBe(false);
		expect(v.revision).toBe(0);
		await expect(
			f.vaultService.initialize(historyOwner, historyInit()),
		).rejects.toThrow('already exists');
		expect(f.vaults.get(historyOwner)).toEqual(v);
	});
	it('should read only the authenticated owner and require an initialized vault', async () => {
		const f = historyMocks();
		await f.ready();
		await expect(f.vaultService.read(historyOther)).rejects.toThrow(
			'not found',
		);
		expect((await f.vaultService.read(historyOwner)).userId).toBe(
			historyOwner,
		);
	});
	it('should atomically update consent and reject stale versions', async () => {
		const f = historyMocks();
		await f.ready();
		expect(
			(
				await f.vaultService.consent(historyOwner, {
					expectedVaultRevision: 1,
					enabled: false,
				})
			).revision,
		).toBe(2);
		await expect(
			f.vaultService.consent(historyOwner, {
				expectedVaultRevision: 1,
				enabled: true,
			}),
		).rejects.toThrow('changed');
		expect(f.vaults.get(historyOwner)?.storageConsent).toBe(false);
	});
	it('should version recovery envelopes without changing the data key epoch or history', async () => {
		const f = historyMocks();
		await f.ready();
		const init = historyInit();
		const envelope = {
			recoveryNonce: init.recoveryNonce,
			recoveryCiphertext: init.recoveryCiphertext,
		};
		const next = await f.vaultService.replaceRecovery(historyOwner, {
			...envelope,
			recoveryVersion: 2,
			expectedVaultRevision: 1,
		});
		expect(next.recoveryVersion).toBe(2);
		expect(next.keyEpoch).toBe(1);
		await expect(
			f.vaultService.replaceRecovery(historyOwner, {
				...envelope,
				recoveryVersion: 2,
				expectedVaultRevision: 2,
			}),
		).rejects.toThrow('version changed');
	});
	it.each(['ADMIN', 'SUSPENDED'])(
		'should deny current %s accounts even at the service boundary',
		async (role) => {
			const f = historyMocks();
			f.users.set(historyOwner, role);
			await expect(
				f.vaultService.initialize(historyOwner, historyInit()),
			).rejects.toThrow('account required');
			expect(f.prisma.historyVault.create).not.toHaveBeenCalled();
		},
	);
});
