import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	NoSuchKey,
	PutObjectCommand,
} from '@aws-sdk/client-s3';
import { ObjectNotFoundError } from './object-store';
import { S3ObjectStore } from './s3-object.store';

describe('S3ObjectStore', () => {
	const send = jest.fn();
	const store = new S3ObjectStore({ send } as never, 'bucket');
	afterEach(() => send.mockReset());
	const command = (call: number) => (send.mock.calls[call] as unknown[])[0];
	const input = (call: number) =>
		(send.mock.calls[call] as [{ input: Record<string, unknown> }])[0]
			.input;

	it('should write new objects under the prefix and refuse to overwrite', async () => {
		send.mockResolvedValue({});
		await store.put('a.bin', Buffer.from('sealed'));
		expect(command(0)).toBeInstanceOf(PutObjectCommand);
		expect(input(0)).toMatchObject({
			Bucket: 'bucket',
			Key: 'credentials/a.bin',
			IfNoneMatch: '*',
		});
	});

	it('should overwrite only through replace', async () => {
		send.mockResolvedValue({});
		await store.replace('a.bin', Buffer.from('resealed'));
		expect(input(0)).not.toHaveProperty('IfNoneMatch');
	});

	it('should read bytes and map a missing key to ObjectNotFoundError', async () => {
		send.mockResolvedValueOnce({
			Body: {
				transformToByteArray: () =>
					Promise.resolve(new Uint8Array([115, 101, 97, 108])),
			},
		});
		expect((await store.get('a.bin')).toString()).toBe('seal');
		expect(command(0)).toBeInstanceOf(GetObjectCommand);
		send.mockRejectedValueOnce(
			new NoSuchKey({ message: 'missing', $metadata: {} }),
		);
		await expect(store.get('b.bin')).rejects.toBeInstanceOf(
			ObjectNotFoundError,
		);
	});

	it('should propagate other provider errors', async () => {
		send.mockRejectedValueOnce(new Error('network'));
		await expect(store.get('a.bin')).rejects.toThrow('network');
	});

	it('should delete and list relative keys after a cursor', async () => {
		send.mockResolvedValueOnce({});
		await store.delete('a.bin');
		expect(command(0)).toBeInstanceOf(DeleteObjectCommand);
		const modified = new Date('2026-01-01');
		send.mockResolvedValueOnce({
			Contents: [{ Key: 'credentials/b.bin', LastModified: modified }],
		});
		expect(await store.list('a.bin', 10)).toEqual([
			{ key: 'b.bin', lastModified: modified },
		]);
		expect(command(1)).toBeInstanceOf(ListObjectsV2Command);
		expect(input(1)).toMatchObject({
			Prefix: 'credentials/',
			StartAfter: 'credentials/a.bin',
			MaxKeys: 10,
		});
	});
});
