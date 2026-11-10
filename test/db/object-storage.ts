import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { S3ObjectStore } from '../../src/infrastructure/storage/s3-object.store';

// The compose RustFS service (`docker compose up -d rustfs`). Values are local-only
// placeholders; CI overrides them through the environment.
const settings = {
	endpoint: process.env.S3_TEST_ENDPOINT ?? 'http://127.0.0.1:9100',
	region: 'us-east-1',
	accessKeyId: process.env.S3_TEST_ACCESS_KEY ?? 'mindcare',
	secretAccessKey: process.env.S3_TEST_SECRET_KEY ?? 'mindcare-storage',
};

/** A fresh, empty bucket on the test S3 service. Fails loudly when it is not running. */
export async function createTestS3Store(): Promise<S3ObjectStore> {
	const bucket = `mindcare-test-${randomUUID().slice(0, 8)}`;
	const client = new S3Client({
		region: settings.region,
		endpoint: settings.endpoint,
		forcePathStyle: true,
		credentials: {
			accessKeyId: settings.accessKeyId,
			secretAccessKey: settings.secretAccessKey,
		},
	});
	try {
		await client.send(new CreateBucketCommand({ Bucket: bucket }));
	} catch {
		throw new Error(
			`Test S3 service unavailable at ${settings.endpoint}; run \`docker compose up -d rustfs\``,
		);
	} finally {
		client.destroy();
	}
	return S3ObjectStore.create({ bucket, ...settings });
}
