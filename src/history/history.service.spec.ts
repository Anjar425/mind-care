import {
	historyEntryId,
	historyEntryInput,
	historyMocks,
	historyOther,
	historyOwner,
} from '../../test/history-mocks';

describe('Immutable owner ciphertext history', () => {
	it('should require storage consent and never create an implicit vault', async () => {
		const f = historyMocks();
		await expect(
			f.service.save(historyOwner, historyEntryId, historyEntryInput()),
		).rejects.toThrow('not found');
		await f.ready();
		await f.vaultService.consent(historyOwner, {
			expectedVaultRevision: 1,
			enabled: false,
		});
		await expect(
			f.service.save(historyOwner, historyEntryId, historyEntryInput(2)),
		).rejects.toThrow('consent');
		expect(f.entries.size).toBe(0);
	});
	it('should persist only opaque clinical ciphertext and support exact immutable retries', async () => {
		const f = historyMocks();
		await f.ready();
		const first = await f.service.save(
			historyOwner,
			historyEntryId,
			historyEntryInput(),
		);
		expect(first.created).toBe(true);
		expect(first.vaultRevision).toBe(2);
		expect(
			(
				await f.service.save(
					historyOwner,
					historyEntryId,
					historyEntryInput(),
				)
			).created,
		).toBe(false);
		expect(f.entries.size).toBe(1);
		expect(Object.keys(first.entry).sort()).toEqual(
			[
				'ciphertext',
				'createdAt',
				'envelopeVersion',
				'id',
				'keyEpoch',
				'nonce',
				'vaultId',
			].sort(),
		);
		await expect(
			f.service.save(historyOwner, historyEntryId, {
				...historyEntryInput(2),
				ciphertext: Buffer.alloc(32, 9).toString('base64url'),
			}),
		).rejects.toThrow('immutable');
	});
	it('should deny foreign entry reads and deletion without revealing existence', async () => {
		const f = historyMocks();
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		await expect(
			f.service.read(historyOther, historyEntryId),
		).rejects.toThrow('not found');
		await expect(
			f.service.remove(historyOther, historyEntryId, {
				expectedVaultRevision: 2,
			}),
		).rejects.toThrow('not found');
		expect(f.entries.size).toBe(1);
	});
	it('should delete all entries while retaining vault, consent and recovery and rejecting stale replay', async () => {
		const f = historyMocks();
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		const before = { ...f.vaults.get(historyOwner)! };
		expect(
			(
				await f.service.removeAll(historyOwner, {
					expectedVaultRevision: 2,
				})
			).vaultRevision,
		).toBe(3);
		expect(f.entries.size).toBe(0);
		expect(f.vaults.get(historyOwner)).toEqual({ ...before, revision: 3 });
		await expect(
			f.service.save(historyOwner, historyEntryId, historyEntryInput()),
		).rejects.toThrow('changed');
		expect(f.entries.size).toBe(0);
		expect(
			(
				await f.service.save(
					historyOwner,
					historyEntryId,
					historyEntryInput(3),
				)
			).created,
		).toBe(true);
	});
	it('should delete one entry and reject stale or missing targets', async () => {
		const f = historyMocks();
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		await expect(
			f.service.remove(historyOwner, historyEntryId, {
				expectedVaultRevision: 1,
			}),
		).rejects.toThrow('changed');
		await f.service.remove(historyOwner, historyEntryId, {
			expectedVaultRevision: 2,
		});
		await expect(
			f.service.read(historyOwner, historyEntryId),
		).rejects.toThrow('not found');
	});
	it('should serialize competing revisions and roll back failed nonce reuse', async () => {
		const f = historyMocks();
		await f.ready();
		const id2 = historyEntryId.slice(0, -1) + '2';
		const result = await Promise.allSettled([
			f.service.save(historyOwner, historyEntryId, historyEntryInput()),
			f.service.save(historyOwner, id2, historyEntryInput()),
		]);
		expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		await expect(
			f.service.save(historyOwner, id2, historyEntryInput(2)),
		).rejects.toThrow('changed');
		expect(f.vaults.get(historyOwner)?.revision).toBe(2);
		expect(f.entries.size).toBe(1);
	});
	it('should preserve old history reads when consent is withdrawn and exclude raw filters', async () => {
		const f = historyMocks();
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		await f.vaultService.consent(historyOwner, {
			expectedVaultRevision: 2,
			enabled: false,
		});
		expect((await f.service.read(historyOwner, historyEntryId)).id).toBe(
			historyEntryId,
		);
		expect(
			(await f.service.list(historyOwner, { limit: 25 })).entries,
		).toHaveLength(1);
	});
	it('should bind pagination to ownership and vault revision', async () => {
		const f = historyMocks();
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		const id2 = historyEntryId.slice(0, -1) + '2';
		await f.service.save(historyOwner, id2, {
			...historyEntryInput(2),
			nonce: Buffer.alloc(12, 8).toString('base64url'),
		});
		const page = await f.service.list(historyOwner, { limit: 1 });
		expect(page.nextCursor).toBe(historyEntryId);
		expect(
			(
				await f.service.list(historyOwner, {
					limit: 1,
					cursor: page.nextCursor!,
					expectedVaultRevision: page.vaultRevision,
				})
			).entries[0].id,
		).toBe(id2);
		await expect(
			f.service.list(historyOwner, {
				limit: 1,
				expectedVaultRevision: 0,
			}),
		).rejects.toThrow('changed');
		await expect(
			f.service.list(historyOwner, {
				limit: 1,
				cursor: id2.slice(0, -1) + '9',
			}),
		).rejects.toThrow('not found');
	});
	it('should fail capacity without evicting retained records', async () => {
		const f = historyMocks();
		await f.ready();
		f.prisma.historyEntry.count.mockResolvedValueOnce(10000);
		await expect(
			f.service.save(historyOwner, historyEntryId, historyEntryInput()),
		).rejects.toThrow('capacity');
		expect(f.prisma.historyEntry.deleteMany).not.toHaveBeenCalled();
		expect(f.vaults.get(historyOwner)?.revision).toBe(1);
	});
});
