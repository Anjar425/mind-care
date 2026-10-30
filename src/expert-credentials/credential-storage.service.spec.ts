import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'node:fs/promises';
import { CredentialStorageService } from './credential-storage.service';
import {
	runtimeConfigProvider,
	runtimeConfigMock,
	syntheticConfig,
} from '../../test/runtime-config.mock';
import { MAX_DOCUMENT_BYTES } from './credential-policy';
import { createHash } from 'node:crypto';

jest.mock('node:fs/promises');
describe('CredentialStorageService', () => {
	let module: TestingModule;
	let service: CredentialStorageService;
	const pdf = () => ({
		buffer: Buffer.from('%PDF-synthetic'),
		size: 14,
		mimetype: 'application/pdf',
	});
	beforeEach(async () => {
		runtimeConfigMock.get.mockImplementation((key) => syntheticConfig[key]);
		jest.mocked(fs.mkdir).mockResolvedValue(undefined);
		jest.mocked(fs.lstat).mockResolvedValue({
			isDirectory: () => true,
			isSymbolicLink: () => false,
		} as Awaited<ReturnType<typeof fs.lstat>>);
		jest.mocked(fs.writeFile).mockResolvedValue(undefined);
		module = await Test.createTestingModule({
			providers: [CredentialStorageService, runtimeConfigProvider],
		}).compile();
		service = module.get(CredentialStorageService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => {
		expect(service).toBeDefined();
	});
	it('should preserve encrypted bytes and bind them to their object context', () => {
		const secret = Buffer.from('synthetic-private');
		const encrypted = service.seal(secret, 'revision');
		expect(encrypted).not.toContain('synthetic-private');
		expect(service.open(encrypted, 'revision')).toEqual(secret);
		expect(() => service.open(encrypted, 'other')).toThrow('unavailable');
	});
	it('should reject authenticated ciphertext when it is modified', () => {
		const encrypted = Buffer.from(
			service.seal(Buffer.from('private'), 'id'),
			'base64',
		);
		encrypted[28] ^= 1;
		expect(() => service.open(encrypted.toString('base64'), 'id')).toThrow(
			'unavailable',
		);
	});
	it('should produce the same protected index for equivalent number formatting', () => {
		expect(service.lookup('STR-123')).toBe(service.lookup('str / 123'));
		expect(service.lookup('STR-123')).not.toContain('STR');
	});
	it('should accept a matching PDF signature and reject a false MIME claim', () => {
		const file = pdf();
		expect(service.validate(file).mime).toBe('application/pdf');
		expect(() =>
			service.validate({ ...file, mimetype: 'image/png' }),
		).toThrow('matching');
	});
	it('should accept PNG and JPEG signatures when MIME agrees', () => {
		for (const [mimetype, buffer] of [
			['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
			['image/jpeg', Buffer.from([255, 216, 255])],
		] as const)
			expect(
				service.validate({ mimetype, buffer, size: buffer.length })
					.mime,
			).toBe(mimetype);
	});
	it('should reject missing, empty or inconsistent document bytes', () => {
		expect(() => service.validate()).toThrow('required');
		expect(() => service.validate({ ...pdf(), size: 0 })).toThrow(
			'required',
		);
	});
	it('should reject oversize uploads before writing an object', () => {
		const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
		expect(() =>
			service.validate({
				buffer,
				size: buffer.length,
				mimetype: 'application/pdf',
			}),
		).toThrow('size');
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
	it('should reject executable content even when renamed as PDF', () => {
		expect(() =>
			service.validate({
				buffer: Buffer.from('MZ-data'),
				size: 7,
				mimetype: 'application/pdf',
			}),
		).toThrow('matching');
	});
	it('should store encrypted bytes under a generated private exclusive filename', async () => {
		const result = await service.put(pdf());
		expect(result.objectKey).toMatch(/\.bin$/);
		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining('.private') as unknown,
			expect.any(String) as unknown,
			{ flag: 'wx', mode: 0o600 },
		);
		expect(jest.mocked(fs.writeFile).mock.calls[0][1]).not.toContain(
			'%PDF-',
		);
	});
	it('should refuse symlink storage ancestors instead of following them', async () => {
		jest.mocked(fs.lstat).mockResolvedValue({
			isDirectory: () => true,
			isSymbolicLink: () => true,
		} as Awaited<ReturnType<typeof fs.lstat>>);
		await expect(service.put(pdf())).rejects.toThrow('write failed');
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
	it('should refuse paths outside the ignored private project directory', async () => {
		runtimeConfigMock.get.mockImplementation((key) =>
			key === 'CREDENTIAL_STORAGE_ROOT'
				? '../outside'
				: syntheticConfig[key],
		);
		await expect(service.put(pdf())).rejects.toThrow('write failed');
	});
	it('should reject traversal object references before reading any document', async () => {
		await expect(service.read('../secret', 'digest', 1)).rejects.toThrow(
			'unavailable',
		);
		expect(fs.open).not.toHaveBeenCalled();
	});
	it('should allow idempotent cleanup only when the generated object is absent', async () => {
		jest.mocked(fs.lstat).mockImplementation((filename) => {
			if (String(filename).endsWith('.bin'))
				return Promise.reject(
					Object.assign(new Error('missing'), { code: 'ENOENT' }),
				);
			return Promise.resolve({
				isDirectory: () => true,
				isSymbolicLink: () => false,
			} as Awaited<ReturnType<typeof fs.lstat>>);
		});
		await expect(
			service.remove('123e4567-e89b-42d3-a456-426614174000.bin'),
		).resolves.toBeUndefined();
	});
	it('should reject a symlink document before opening a private download', async () => {
		jest.mocked(fs.lstat).mockImplementation((filename) =>
			Promise.resolve({
				isDirectory: () => true,
				isFile: () => true,
				isSymbolicLink: () => String(filename).endsWith('.bin'),
			} as Awaited<ReturnType<typeof fs.lstat>>),
		);
		await expect(
			service.read(
				'123e4567-e89b-42d3-a456-426614174000.bin',
				'digest',
				1,
			),
		).rejects.toThrow('unavailable');
		expect(fs.open).not.toHaveBeenCalled();
	});
	it('should decrypt a retained document and verify its digest and size before download', async () => {
		const key = '123e4567-e89b-42d3-a456-426614174000.bin';
		const bytes = pdf().buffer;
		const encrypted = service.seal(bytes, key);
		const close = jest.fn().mockResolvedValue(undefined);
		jest.mocked(fs.lstat).mockResolvedValue({
			isDirectory: () => true,
			isFile: () => true,
			isSymbolicLink: () => false,
		} as Awaited<ReturnType<typeof fs.lstat>>);
		jest.mocked(fs.open).mockResolvedValue({
			stat: () =>
				Promise.resolve({ isFile: () => true, size: encrypted.length }),
			readFile: () => Promise.resolve(encrypted),
			close,
		} as unknown as fs.FileHandle);
		expect(
			await service.read(
				key,
				createHash('sha256').update(bytes).digest('hex'),
				bytes.length,
			),
		).toEqual(bytes);
		await expect(
			service.read(key, 'wrong-digest', bytes.length),
		).rejects.toThrow('unavailable');
		expect(close).toHaveBeenCalledTimes(2);
	});
	it('should rotate bounded orphan scan batches so referenced files cannot hide later orphans', async () => {
		const entries = Array.from({ length: 201 }, (_, i) => ({
			name: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}.bin`,
			isFile: () => true,
		}));
		jest.mocked(fs.readdir).mockResolvedValue(
			entries as unknown as Awaited<ReturnType<typeof fs.readdir>>,
		);
		jest.mocked(fs.lstat).mockResolvedValue({
			isDirectory: () => true,
			isFile: () => true,
			isSymbolicLink: () => false,
			mtime: new Date('2020-01-01'),
		} as Awaited<ReturnType<typeof fs.lstat>>);
		const first = await service.orphanCandidates(new Date());
		const second = await service.orphanCandidates(new Date());
		const third = await service.orphanCandidates(new Date());
		expect(first).toHaveLength(100);
		expect(second).toHaveLength(100);
		expect(second).not.toContain(first[0]);
		expect(third).toContain(entries[200].name);
	});
});
