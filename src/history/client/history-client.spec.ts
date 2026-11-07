import { webcrypto } from 'node:crypto';
import {
	historyDocument,
	historyMocks,
	historyOwner,
} from '../../../test/history-mocks';
import {
	historyTransport,
	PrivateHistoryClient,
	type ClientVault,
	type HistoryApiRequest,
	type HistoryTransport,
} from './history-client';
import type { DeviceMaterial } from './history-crypto';
import type { HistoryDeviceStore } from './history-device-store';
const crypto = webcrypto as unknown as Crypto;
export function clientFixture() {
	const f = historyMocks();
	const values = new Map<string, DeviceMaterial>();
	const store: HistoryDeviceStore = {
		get: jest.fn((u, v) =>
			Promise.resolve(values.get(JSON.stringify([u, v]))),
		),
		put: jest.fn((m) => {
			values.set(JSON.stringify([m.ownerId, m.vaultId]), m);
			return Promise.resolve();
		}),
		forget: jest.fn((u, v) => {
			values.delete(JSON.stringify([u, v]));
			return Promise.resolve();
		}),
	};
	const transport: HistoryTransport = {
		vault: async () =>
			(await f.vaultService.read(historyOwner)) as ClientVault,
		initialize: async (input) =>
			(await f.vaultService.initialize(
				historyOwner,
				input,
			)) as ClientVault,
		consent: async (expectedVaultRevision, enabled) =>
			(await f.vaultService.consent(historyOwner, {
				expectedVaultRevision,
				enabled,
			})) as ClientVault,
		recovery: async (input) =>
			(await f.vaultService.replaceRecovery(
				historyOwner,
				input,
			)) as ClientVault,
		save: (id, input) => f.service.save(historyOwner, id, input),
		page: (query) => f.service.list(historyOwner, query),
		remove: (id, expectedVaultRevision) =>
			id === null
				? f.service.removeAll(historyOwner, { expectedVaultRevision })
				: f.service.remove(historyOwner, id, { expectedVaultRevision }),
	};
	const client = new PrivateHistoryClient(
		historyOwner,
		transport,
		store,
		crypto,
	);
	return { ...f, values, store, transport, client };
}
describe('Client SDK with real opaque history services and native Web Crypto', () => {
	it('should expose entry identity for deletion and capture answers before the first network await', async () => {
		const f = clientFixture();
		await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		const value = historyDocument(true);
		const work = f.client.saveSuccessfulScreening(value);
		value.answers[0].score = 3;
		expect((await work).saved).toBe(true);
		const page = await f.client.page();
		expect(page.items[0].document.answers[0].score).toBe(1.5);
		await f.client.remove(page.items[0].id);
		expect(f.entries.size).toBe(0);
	});
	it('should require explicit opt-in before automatic encrypted saves', async () => {
		const f = clientFixture();
		await f.client.initialize();
		expect(
			await f.client.saveSuccessfulScreening(historyDocument()),
		).toEqual({ saved: false, reason: 'CONSENT_OFF' });
		await f.client.enableAutomaticSaving(true);
		expect(
			(await f.client.saveSuccessfulScreening(historyDocument(true)))
				.saved,
		).toBe(true);
		expect(f.entries.size).toBe(1);
		expect(JSON.stringify([...f.entries.values()])).not.toContain(
			'questionId',
		);
		expect((await f.client.page()).documents).toEqual([
			historyDocument(true),
		]);
	});
	it('should recover exact answers on a new device and retain keys after deleting all entries', async () => {
		const f = clientFixture();
		const setup = await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		await f.client.saveSuccessfulScreening(historyDocument());
		f.values.clear();
		expect(
			(await f.client.saveSuccessfulScreening(historyDocument())).reason,
		).toBe('DEVICE_LOCKED');
		await f.client.recoverDevice(setup.recoveryCode);
		expect((await f.client.page()).documents[0]).toEqual(historyDocument());
		await f.client.removeAllEntries();
		expect(f.entries.size).toBe(0);
		expect(f.values.size).toBe(1);
		expect(
			(await f.client.saveSuccessfulScreening(historyDocument())).saved,
		).toBe(true);
	});
	it('should withdraw consent without deleting old history or falling back to plaintext', async () => {
		const f = clientFixture();
		await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		await f.client.saveSuccessfulScreening(historyDocument());
		await f.client.withdrawConsent();
		expect(
			(await f.client.saveSuccessfulScreening(historyDocument())).reason,
		).toBe('CONSENT_OFF');
		expect((await f.client.page()).documents).toHaveLength(1);
	});
	it('should report corrupted entries as incomplete without inventing zero results', async () => {
		const f = clientFixture();
		await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		await f.client.saveSuccessfulScreening(historyDocument());
		const entry = [...f.entries.values()][0];
		entry.ciphertext = Buffer.alloc(32).toString('base64url');
		const page = await f.client.page();
		expect(page.complete).toBe(false);
		expect(page.documents).toHaveLength(0);
		expect(page.unavailableIds).toEqual([entry.id]);
	});
	it('should never retry stale queued writes after deletion', async () => {
		const f = clientFixture();
		await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		const save = jest
			.spyOn(f.transport, 'save')
			.mockImplementation(async (id, input) => {
				await f.client.removeAllEntries();
				return f.service.save(historyOwner, id, input);
			});
		expect(
			(await f.client.saveSuccessfulScreening(historyDocument())).reason,
		).toBe('UNCONFIRMED');
		expect(save).toHaveBeenCalledTimes(1);
		expect(f.entries.size).toBe(0);
	});
	it('should rotate recovery without altering existing encrypted history', async () => {
		const f = clientFixture();
		const before = await f.client.initialize();
		await f.client.enableAutomaticSaving(true);
		await f.client.saveSuccessfulScreening(historyDocument());
		const after = await f.client.replaceRecoveryCode();
		f.values.clear();
		await expect(
			f.client.recoverDevice(before.recoveryCode),
		).rejects.toThrow();
		await f.client.recoverDevice(after.recoveryCode);
		expect((await f.client.page()).documents).toHaveLength(1);
	});
	it('should map transport endpoints and remove standard response envelopes', async () => {
		const request = jest.fn().mockResolvedValue({ data: { revision: 2 } });
		const transport = historyTransport(request as HistoryApiRequest);
		await transport.consent(1, true);
		await transport.remove(null, 2);
		await transport.page({ limit: 25, expectedVaultRevision: 2 });
		expect(request).toHaveBeenCalledWith('PUT', '/me/history/consent', {
			expectedVaultRevision: 1,
			enabled: true,
		});
		expect(request).toHaveBeenCalledWith('DELETE', '/me/history/entries', {
			expectedVaultRevision: 2,
		});
		expect(request).toHaveBeenCalledWith(
			'GET',
			'/me/history/entries?limit=25&expectedVaultRevision=2',
			undefined,
		);
	});
});
