import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from '@aws-sdk/client-s3';
import {
	ObjectNotFoundError,
	type ObjectStore,
	type StoredObject,
} from './object-store';

export interface S3StoreOptions {
	bucket: string;
	region: string;
	/** S3-compatible endpoint (RustFS, R2, …); unset for AWS S3. */
	endpoint?: string;
	/** Static credentials; unset uses the AWS default chain (environment, role). */
	accessKeyId?: string;
	secretAccessKey?: string;
}

/** Every credential object lives under this prefix of the bucket. */
const PREFIX = 'credentials/';

/**
 * Private S3-compatible bucket. Objects are already sealed by the application (AES-GCM);
 * bucket encryption is an additional layer. The bucket must not be public; documents are
 * only ever streamed through the API after authorization.
 */
export class S3ObjectStore implements ObjectStore {
	constructor(
		private readonly client: Pick<S3Client, 'send'>,
		private readonly bucket: string,
	) {}

	static create(options: S3StoreOptions): S3ObjectStore {
		return new S3ObjectStore(
			new S3Client({
				region: options.region,
				...(options.endpoint && {
					endpoint: options.endpoint,
					forcePathStyle: true,
				}),
				...(options.accessKeyId &&
					options.secretAccessKey && {
						credentials: {
							accessKeyId: options.accessKeyId,
							secretAccessKey: options.secretAccessKey,
						},
					}),
			}),
			options.bucket,
		);
	}

	async put(key: string, body: Buffer): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: PREFIX + key,
				Body: body,
				ContentType: 'application/octet-stream',
				// Never overwrite: generated keys are unique, a collision is an error.
				IfNoneMatch: '*',
			}),
		);
	}

	async replace(key: string, body: Buffer): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: PREFIX + key,
				Body: body,
				ContentType: 'application/octet-stream',
			}),
		);
	}

	async get(key: string): Promise<Buffer> {
		try {
			const result = await this.client.send(
				new GetObjectCommand({
					Bucket: this.bucket,
					Key: PREFIX + key,
				}),
			);
			if (!result.Body) throw new Error('Empty object');
			return Buffer.from(await result.Body.transformToByteArray());
		} catch (error) {
			if (isMissing(error)) throw new ObjectNotFoundError();
			throw error;
		}
	}

	async delete(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.bucket, Key: PREFIX + key }),
		);
	}

	async list(after: string, limit: number): Promise<StoredObject[]> {
		const result = await this.client.send(
			new ListObjectsV2Command({
				Bucket: this.bucket,
				Prefix: PREFIX,
				StartAfter: PREFIX + after,
				MaxKeys: limit,
			}),
		);
		return (result.Contents ?? [])
			.filter((object) => object.Key?.startsWith(PREFIX))
			.map((object) => ({
				key: object.Key!.slice(PREFIX.length),
				lastModified: object.LastModified ?? new Date(0),
			}));
	}
}

function isMissing(error: unknown): boolean {
	return (
		error instanceof S3ServiceException &&
		(error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)
	);
}
