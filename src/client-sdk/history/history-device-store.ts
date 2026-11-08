import type { DeviceMaterial } from './history-crypto';
export interface HistoryDeviceStore {
	get(ownerId: string, vaultId: string): Promise<DeviceMaterial | undefined>;
	put(material: DeviceMaterial): Promise<void>;
	forget(ownerId: string, vaultId: string): Promise<void>;
}
// Only a non-extractable device wrapping key and wrapped data key are persisted.
// Same-origin hostile scripts/device-profile access remain outside this protection.
export class IndexedDbHistoryDeviceStore implements HistoryDeviceStore {
	constructor(private readonly factory: IDBFactory = globalThis.indexedDB) {}
	private async run<T>(
		mode: IDBTransactionMode,
		operation: (store: IDBObjectStore, result: (value: T) => void) => void,
	): Promise<T> {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			if (!this.factory) {
				reject(new Error('Private device storage unavailable'));
				return;
			}
			const request = this.factory.open(
				'mind-care-private-history-v1',
				1,
			);
			request.onupgradeneeded = () =>
				request.result.createObjectStore('devices');
			request.onerror = request.onblocked = () =>
				reject(new Error('Private device storage unavailable'));
			request.onsuccess = () => resolve(request.result);
		});
		try {
			return await new Promise<T>((resolve, reject) => {
				let value: T;
				const tx = db.transaction('devices', mode);
				tx.oncomplete = () => resolve(value);
				tx.onerror = tx.onabort = () =>
					reject(new Error('Private device storage unavailable'));
				operation(tx.objectStore('devices'), (result) => {
					value = result;
				});
			});
		} finally {
			db.close();
		}
	}
	get(ownerId: string, vaultId: string) {
		return this.run<DeviceMaterial | undefined>(
			'readonly',
			(store, result) => {
				const request = store.get(JSON.stringify([ownerId, vaultId]));
				request.onsuccess = () => {
					result(request.result as DeviceMaterial | undefined);
				};
			},
		);
	}
	put(material: DeviceMaterial) {
		return this.run<void>('readwrite', (store, result) => {
			store.put(
				material,
				JSON.stringify([material.ownerId, material.vaultId]),
			);
			result(undefined);
		});
	}
	forget(ownerId: string, vaultId: string) {
		return this.run<void>('readwrite', (store, result) => {
			store.delete(JSON.stringify([ownerId, vaultId]));
			result(undefined);
		});
	}
}
