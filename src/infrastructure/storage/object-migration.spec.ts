import { copyObjects } from './object-migration';
import {
	ObjectNotFoundError,
	type ObjectStore,
	type StoredObject,
} from './object-store';

/** In-memory store with the same contract as the real ones. */
export class MemoryObjectStore implements ObjectStore {
	readonly objects = new Map<string, Buffer>();
	failGet = new Set<string>();
	put(key: string, body: Buffer) {
		if (this.objects.has(key)) return Promise.reject(new Error('exists'));
		this.objects.set(key, Buffer.from(body));
		return Promise.resolve();
	}
	replace(key: string, body: Buffer) {
		this.objects.set(key, Buffer.from(body));
		return Promise.resolve();
	}
	get(key: string) {
		if (this.failGet.has(key)) return Promise.reject(new Error('io'));
		const body = this.objects.get(key);
		return body
			? Promise.resolve(Buffer.from(body))
			: Promise.reject(new ObjectNotFoundError());
	}
	delete(key: string) {
		this.objects.delete(key);
		return Promise.resolve();
	}
	list(after: string, limit: number): Promise<StoredObject[]> {
		return Promise.resolve(
			[...this.objects.keys()]
				.filter((key) => key > after)
				.sort()
				.slice(0, limit)
				.map((key) => ({ key, lastModified: new Date(0) })),
		);
	}
}

describe('copyObjects', () => {
	function stores(count: number) {
		const source = new MemoryObjectStore();
		for (let i = 0; i < count; i++)
			source.objects.set(
				`${String(i).padStart(4, '0')}.bin`,
				Buffer.from(`v${i}`),
			);
		return { source, target: new MemoryObjectStore() };
	}

	it('should report without writing on a dry run', async () => {
		const { source, target } = stores(3);
		expect(await copyObjects(source, target, false)).toEqual({
			scanned: 3,
			copied: 3,
			present: 0,
			conflicts: 0,
			failed: 0,
		});
		expect(target.objects.size).toBe(0);
	});

	it('should copy every page, skip identical copies and never overwrite conflicts', async () => {
		const { source, target } = stores(250);
		target.objects.set('0000.bin', Buffer.from('v0'));
		target.objects.set('0001.bin', Buffer.from('different'));
		source.failGet.add('0002.bin');
		expect(await copyObjects(source, target, true)).toEqual({
			scanned: 250,
			copied: 247,
			present: 1,
			conflicts: 1,
			failed: 1,
		});
		expect(target.objects.get('0001.bin')?.toString()).toBe('different');
		expect(source.objects.size).toBe(250);
		// Re-running is a no-op.
		source.failGet.clear();
		expect(await copyObjects(source, target, true)).toMatchObject({
			copied: 1,
			present: 248,
			conflicts: 1,
		});
	});
});
