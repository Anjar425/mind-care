import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { LocalObjectStore } from '../../src/infrastructure/storage/local-object.store';
import { copyObjects } from '../../src/infrastructure/storage/object-migration';
import {
	ObjectNotFoundError,
	type ObjectStore,
} from '../../src/infrastructure/storage/object-store';
import { createTestS3Store } from './object-storage';

const roots: string[] = [];
function localStore(): LocalObjectStore {
	const root = `.private/test-${randomUUID().slice(0, 8)}`;
	roots.push(root);
	return new LocalObjectStore(root);
}
afterAll(() =>
	Promise.all(
		roots.map((root) => rm(root, { recursive: true, force: true })),
	),
);

// The same contract for the local directory and a real S3-compatible bucket (RustFS).
describe.each([
	['local', () => Promise.resolve<ObjectStore>(localStore())],
	['s3 (RustFS)', () => createTestS3Store() as Promise<ObjectStore>],
])('%s object store', (_name, create) => {
	let store: ObjectStore;
	beforeAll(async () => {
		store = await create();
	});

	it('3C-1: stores, reads, replaces and deletes an object', async () => {
		const key = `${randomUUID()}.bin`;
		await store.put(key, Buffer.from('v2.k0.first'));
		expect((await store.get(key)).toString()).toBe('v2.k0.first');
		await store.replace(key, Buffer.from('v2.k1.second'));
		expect((await store.get(key)).toString()).toBe('v2.k1.second');
		await store.delete(key);
		await expect(store.get(key)).rejects.toBeInstanceOf(
			ObjectNotFoundError,
		);
		await expect(store.delete(key)).resolves.toBeUndefined();
	});

	it('3C-1: never overwrites an existing key on put', async () => {
		const key = `${randomUUID()}.bin`;
		await store.put(key, Buffer.from('original'));
		await expect(
			store.put(key, Buffer.from('other')),
		).rejects.toBeDefined();
		expect((await store.get(key)).toString()).toBe('original');
	});

	it('3C-1: lists keys in order after a cursor, with modification times', async () => {
		const keys = ['0001', '0002', '0003'].map(
			(n) => `00000000-0000-4000-8000-00000000${n}.bin`,
		);
		for (const key of keys) await store.put(key, Buffer.from(key));
		const first = await store.list('', 2);
		expect(first.map((o) => o.key)).toEqual(keys.slice(0, 2));
		expect(first[0].lastModified).toBeInstanceOf(Date);
		const rest = await store.list(first[1].key, 10);
		expect(rest.map((o) => o.key)).toContain(keys[2]);
		expect(rest.map((o) => o.key)).not.toContain(keys[0]);
	});
});

describe('storage migration to S3', () => {
	it('3C-2: copies every local object to the bucket, verifies it and is re-runnable', async () => {
		const source = localStore();
		const target = await createTestS3Store();
		for (let i = 0; i < 3; i++)
			await source.put(`${randomUUID()}.bin`, Buffer.from(`sealed-${i}`));
		expect(await copyObjects(source, target, false)).toMatchObject({
			scanned: 3,
			copied: 3,
		});
		expect(await target.list('', 10)).toHaveLength(0);
		expect(await copyObjects(source, target, true)).toMatchObject({
			copied: 3,
			failed: 0,
		});
		expect(await copyObjects(source, target, true)).toMatchObject({
			copied: 0,
			present: 3,
		});
		expect(await source.list('', 10)).toHaveLength(3);
	});
});
