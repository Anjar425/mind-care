import {
	BadRequestException,
	Injectable,
	PayloadTooLargeException,
	ServiceUnavailableException,
	UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	randomUUID,
} from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import {
	MAX_DOCUMENT_BYTES,
	numberIdentity,
	type CredentialUpload,
} from './credential-policy';

@Injectable()
export class CredentialStorageService {
	private orphanCursor = '';
	constructor(
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}
	private key() {
		return Buffer.from(
			this.config.get('CREDENTIAL_ENCRYPTION_KEY', { infer: true }),
			'hex',
		);
	}
	seal(bytes: Buffer, context: string): string {
		const nonce = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
		cipher.setAAD(Buffer.from(context));
		const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
		return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString(
			'base64',
		);
	}
	open(value: string, context: string): Buffer {
		try {
			const bytes = Buffer.from(value, 'base64');
			const decipher = createDecipheriv(
				'aes-256-gcm',
				this.key(),
				bytes.subarray(0, 12),
			);
			decipher.setAAD(Buffer.from(context));
			decipher.setAuthTag(bytes.subarray(12, 28));
			return Buffer.concat([
				decipher.update(bytes.subarray(28)),
				decipher.final(),
			]);
		} catch {
			throw new ServiceUnavailableException(
				'Private document is unavailable',
			);
		}
	}
	lookup(number: string) {
		const key = this.config.get('CREDENTIAL_LOOKUP_KEY', { infer: true });
		return createHmac('sha256', Buffer.from(key, 'hex'))
			.update(numberIdentity(number))
			.digest('hex');
	}
	validate(file?: CredentialUpload) {
		if (
			!file ||
			!Buffer.isBuffer(file.buffer) ||
			file.buffer.length !== file.size ||
			file.size === 0
		)
			throw new BadRequestException(
				'A nonempty document file is required',
			);
		if (
			file.size >
			Math.min(
				MAX_DOCUMENT_BYTES,
				this.config.get('CREDENTIAL_UPLOAD_MAX_BYTES', { infer: true }),
			)
		)
			throw new PayloadTooLargeException(
				'Document exceeds the allowed size',
			);
		const bytes = file.buffer;
		const kind = bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
			? 'application/pdf'
			: bytes
						.subarray(0, 8)
						.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
				? 'image/png'
				: bytes.length >= 3 &&
					  bytes[0] === 255 &&
					  bytes[1] === 216 &&
					  bytes[2] === 255
					? 'image/jpeg'
					: null;
		if (!kind || file.mimetype !== kind)
			throw new UnsupportedMediaTypeException(
				'Only matching PDF, JPEG and PNG document signatures are accepted',
			);
		return {
			mime: kind,
			size: file.size,
			digest: createHash('sha256').update(bytes).digest('hex'),
		};
	}
	private async root() {
		const configured = this.config.get('CREDENTIAL_STORAGE_ROOT', {
			infer: true,
		});
		// Local adapter is deliberately confined to an ignored private project directory.
		const base = path.resolve(process.cwd(), '.private');
		const root = path.resolve(process.cwd(), configured);
		if (!root.startsWith(base + path.sep))
			throw new ServiceUnavailableException(
				'Invalid private storage configuration',
			);
		const segments = path.relative(process.cwd(), root).split(path.sep);
		let current = process.cwd();
		for (const segment of segments) {
			current = path.join(current, segment);
			try {
				await fs.mkdir(current, { mode: 0o700 });
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						'code' in error &&
						error.code === 'EEXIST'
					)
				)
					throw new ServiceUnavailableException(
						'Private storage is unavailable',
					);
			}
			const info = await fs.lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory())
				throw new ServiceUnavailableException(
					'Unsafe private storage path',
				);
		}
		return root;
	}
	private async filename(key: string) {
		if (!/^[a-f0-9-]{36}\.bin$/.test(key))
			throw new ServiceUnavailableException(
				'Invalid private object reference',
			);
		return path.join(await this.root(), key);
	}
	async put(file: CredentialUpload) {
		const metadata = this.validate(file);
		const objectKey = `${randomUUID()}.bin`;
		try {
			await fs.writeFile(
				await this.filename(objectKey),
				this.seal(file.buffer, objectKey),
				{ flag: 'wx', mode: 0o600 },
			);
			return { objectKey, ...metadata };
		} catch {
			throw new ServiceUnavailableException(
				'Private storage write failed',
			);
		}
	}
	async read(objectKey: string, digest: string, size: number) {
		try {
			const filename = await this.filename(objectKey);
			const original = await fs.lstat(filename);
			if (!original.isFile() || original.isSymbolicLink())
				throw new Error('Unsafe object');
			const handle = await fs.open(
				filename,
				constants.O_RDONLY | constants.O_NOFOLLOW,
			);
			try {
				const info = await handle.stat();
				if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES * 2)
					throw new Error('Invalid object');
				const bytes = this.open(
					await handle.readFile({ encoding: 'utf8' }),
					objectKey,
				);
				if (
					bytes.length !== size ||
					createHash('sha256').update(bytes).digest('hex') !== digest
				)
					throw new Error('Integrity mismatch');
				return bytes;
			} finally {
				await handle.close();
			}
		} catch {
			throw new ServiceUnavailableException(
				'Private document is unavailable',
			);
		}
	}
	async orphanCandidates(olderThan: Date): Promise<string[]> {
		const root = await this.root();
		const result: string[] = [];
		const entries = (await fs.readdir(root, { withFileTypes: true }))
			.filter(
				(entry) =>
					entry.isFile() && /^[a-f0-9-]{36}\.bin$/.test(entry.name),
			)
			.sort((a, b) => a.name.localeCompare(b.name));
		let start = entries.findIndex(
			(entry) => entry.name > this.orphanCursor,
		);
		if (start < 0) start = 0;
		const batch = [
			...entries.slice(start),
			...entries.slice(0, start),
		].slice(0, 100);
		for (const entry of batch) {
			const info = await fs.lstat(path.join(root, entry.name));
			if (
				info.isFile() &&
				!info.isSymbolicLink() &&
				info.mtime < olderThan
			)
				result.push(entry.name);
		}
		if (batch.length) this.orphanCursor = batch[batch.length - 1].name;
		return result;
	}
	async remove(objectKey: string): Promise<void> {
		try {
			const filename = await this.filename(objectKey);
			const info = await fs.lstat(filename);
			if (!info.isFile() || info.isSymbolicLink())
				throw new Error('Unsafe object');
			await fs.unlink(filename);
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOENT'
			)
				return;
			throw new ServiceUnavailableException(
				'Private document cleanup failed',
			);
		}
	}
}
