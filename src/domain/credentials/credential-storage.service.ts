import {
	BadRequestException,
	Inject,
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
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import { findKey, type RingKey } from '../../infrastructure/config/key-ring';
import {
	OBJECT_STORE,
	type ObjectStore,
} from '../../infrastructure/storage/object-store';
import {
	MAX_DOCUMENT_BYTES,
	numberIdentity,
	type CredentialUpload,
} from './credential-policy';

const OBJECT_KEY = /^[a-f0-9-]{36}\.bin$/;
const ENVELOPE_V2 = /^v2\.([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9+/=]+)$/;

/**
 * Credential numbers and documents are sealed with AES-256-GCM before they reach the database
 * or object storage, bound to their record by the GCM associated data.
 *
 * Envelope: `v2.<kid>.<base64(nonce|tag|ciphertext)>`, sealed with the first key of
 * CREDENTIAL_ENCRYPTION_KEYS; any key of the ring opens it. Values written before key ids
 * existed (plain base64) belong to key `k0`.
 */
@Injectable()
export class CredentialStorageService {
	private orphanCursor = '';
	constructor(
		private readonly config: ConfigService<RuntimeEnvironment, true>,
		@Inject(OBJECT_STORE) private readonly store: ObjectStore,
	) {}

	private ring(): RingKey[] {
		return this.config.get('CREDENTIAL_ENCRYPTION_KEYS', { infer: true });
	}

	/** Key id of the key that seals new values. */
	currentKid(): string {
		return this.ring()[0].kid;
	}

	/** Key id a sealed value was written with (`k0` for the unversioned format). */
	kidOf(value: string): string {
		return ENVELOPE_V2.exec(value)?.[1] ?? 'k0';
	}

	seal(bytes: Buffer, context: string): string {
		const [key] = this.ring();
		const nonce = randomBytes(12);
		const cipher = createCipheriv(
			'aes-256-gcm',
			Buffer.from(key.secret, 'hex'),
			nonce,
		);
		cipher.setAAD(Buffer.from(context));
		const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
		const payload = Buffer.concat([
			nonce,
			cipher.getAuthTag(),
			encrypted,
		]).toString('base64');
		return `v2.${key.kid}.${payload}`;
	}

	open(value: string, context: string): Buffer {
		try {
			const versioned = ENVELOPE_V2.exec(value);
			const key = findKey(this.ring(), versioned?.[1]);
			if (!key) throw new Error('Unknown key id');
			const bytes = Buffer.from(
				versioned ? versioned[2] : value,
				'base64',
			);
			const decipher = createDecipheriv(
				'aes-256-gcm',
				Buffer.from(key.secret, 'hex'),
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

	/** Re-seals a value with the current key; unchanged when it already uses it. */
	reseal(value: string, context: string): string {
		return this.kidOf(value) === this.currentKid()
			? value
			: this.seal(this.open(value, context), context);
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
	async put(file: CredentialUpload) {
		const metadata = this.validate(file);
		const objectKey = `${randomUUID()}.bin`;
		try {
			await this.store.put(
				objectKey,
				Buffer.from(this.seal(file.buffer, objectKey), 'utf8'),
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
			const bytes = this.open(
				await this.sealedObject(objectKey),
				objectKey,
			);
			if (
				bytes.length !== size ||
				createHash('sha256').update(bytes).digest('hex') !== digest
			)
				throw new Error('Integrity mismatch');
			return bytes;
		} catch {
			throw new ServiceUnavailableException(
				'Private document is unavailable',
			);
		}
	}
	/**
	 * Re-seals a stored document with the current key. Returns false when it already uses it.
	 * The plaintext is verified against the recorded digest before anything is written.
	 */
	async resealObject(
		objectKey: string,
		digest: string,
		size: number,
	): Promise<boolean> {
		const sealed = await this.sealedObject(objectKey);
		if (this.kidOf(sealed) === this.currentKid()) return false;
		const bytes = await this.read(objectKey, digest, size);
		await this.store.replace(
			objectKey,
			Buffer.from(this.seal(bytes, objectKey), 'utf8'),
		);
		return true;
	}
	/** Key id a stored document is sealed with. */
	async sealedKid(objectKey: string): Promise<string> {
		return this.kidOf(await this.sealedObject(objectKey));
	}
	/** Objects older than `olderThan`, scanned in rotating batches of 100. */
	async orphanCandidates(olderThan: Date): Promise<string[]> {
		let batch = await this.store.list(this.orphanCursor, 100);
		if (batch.length === 0 && this.orphanCursor) {
			this.orphanCursor = '';
			batch = await this.store.list('', 100);
		}
		if (batch.length) this.orphanCursor = batch[batch.length - 1].key;
		return batch
			.filter(
				(object) =>
					OBJECT_KEY.test(object.key) &&
					object.lastModified < olderThan,
			)
			.map((object) => object.key);
	}
	async remove(objectKey: string): Promise<void> {
		try {
			this.assertKey(objectKey);
			await this.store.delete(objectKey);
		} catch {
			throw new ServiceUnavailableException(
				'Private document cleanup failed',
			);
		}
	}
	private async sealedObject(objectKey: string): Promise<string> {
		this.assertKey(objectKey);
		const raw = await this.store.get(objectKey);
		if (raw.length > MAX_DOCUMENT_BYTES * 2)
			throw new Error('Invalid object');
		return raw.toString('utf8');
	}
	private assertKey(objectKey: string) {
		if (!OBJECT_KEY.test(objectKey))
			throw new Error('Invalid private object reference');
	}
}
