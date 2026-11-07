import { webcrypto } from 'node:crypto';
import { historyOwner } from '../../../test/history-mocks';
import { createHistoryVault } from './history-crypto';
import { IndexedDbHistoryDeviceStore } from './history-device-store';
describe('IndexedDB device adapter with synthetic event storage (not browser verification)', () => {
	it('should reject unavailable browser storage without falling back to plaintext', async () => {
		const store = new IndexedDbHistoryDeviceStore(undefined);
		await expect(store.get(historyOwner, historyOwner)).rejects.toThrow(
			'storage unavailable',
		);
	});
	it('should persist only structured-cloneable wrapped device material and forget it on request', async () => {
		const data = new Map<string, unknown>();
		const close = jest.fn();
		const factory = {
			open: () => {
				const opened: {
					result?: unknown;
					onsuccess?: () => void;
					onerror?: () => void;
				} = {};
				opened.result = {
					close,
					transaction: () => {
						const transaction: {
							oncomplete?: () => void;
							onerror?: () => void;
							onabort?: () => void;
							objectStore?: () => unknown;
						} = {};
						transaction.objectStore = () => ({
							get: (key: string) => {
								const req: {
									result: unknown;
									onsuccess?: () => void;
								} = { result: structuredClone(data.get(key)) };
								queueMicrotask(() => req.onsuccess?.());
								return req;
							},
							put: (value: unknown, key: string) =>
								data.set(key, structuredClone(value)),
							delete: (key: string) => data.delete(key),
						});
						queueMicrotask(() =>
							queueMicrotask(() => transaction.oncomplete?.()),
						);
						return transaction;
					},
				};
				queueMicrotask(() => opened.onsuccess?.());
				return opened;
			},
		};
		const store = new IndexedDbHistoryDeviceStore(
			factory as unknown as IDBFactory,
		);
		const setup = await createHistoryVault(
			historyOwner,
			webcrypto as unknown as Crypto,
		);
		await store.put(setup.material);
		const material = await store.get(historyOwner, setup.binding.vaultId);
		expect(material?.wrappingKey.extractable).toBe(false);
		expect(material?.wrappedKey).toBe(setup.material.wrappedKey);
		expect(JSON.stringify([...data.values()])).not.toContain(
			setup.recoveryCode,
		);
		await store.forget(historyOwner, setup.binding.vaultId);
		expect(
			await store.get(historyOwner, setup.binding.vaultId),
		).toBeUndefined();
		expect(close).toHaveBeenCalledTimes(4);
	});
});
