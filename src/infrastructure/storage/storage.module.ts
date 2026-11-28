import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../config/environment.config';
import { LocalObjectStore } from './local-object.store';
import { OBJECT_STORE, type ObjectStore } from './object-store';
import { S3ObjectStore } from './s3-object.store';

type Settings = Pick<
	RuntimeEnvironment,
	| 'STORAGE_DRIVER'
	| 'CREDENTIAL_STORAGE_ROOT'
	| 'S3_BUCKET'
	| 'S3_REGION'
	| 'S3_ENDPOINT'
	| 'S3_ACCESS_KEY_ID'
	| 'S3_SECRET_ACCESS_KEY'
>;

export function createObjectStore(settings: Settings): ObjectStore {
	if (settings.STORAGE_DRIVER === 'local')
		return new LocalObjectStore(settings.CREDENTIAL_STORAGE_ROOT);
	return S3ObjectStore.create({
		bucket: settings.S3_BUCKET,
		region: settings.S3_REGION,
		endpoint: settings.S3_ENDPOINT || undefined,
		accessKeyId: settings.S3_ACCESS_KEY_ID || undefined,
		secretAccessKey: settings.S3_SECRET_ACCESS_KEY || undefined,
	});
}

export function storageSettings(
	config: ConfigService<RuntimeEnvironment, true>,
): Settings {
	return {
		STORAGE_DRIVER: config.get('STORAGE_DRIVER', { infer: true }),
		CREDENTIAL_STORAGE_ROOT: config.get('CREDENTIAL_STORAGE_ROOT', {
			infer: true,
		}),
		S3_BUCKET: config.get('S3_BUCKET', { infer: true }),
		S3_REGION: config.get('S3_REGION', { infer: true }),
		S3_ENDPOINT: config.get('S3_ENDPOINT', { infer: true }),
		S3_ACCESS_KEY_ID: config.get('S3_ACCESS_KEY_ID', { infer: true }),
		S3_SECRET_ACCESS_KEY: config.get('S3_SECRET_ACCESS_KEY', {
			infer: true,
		}),
	};
}

@Module({
	providers: [
		{
			provide: OBJECT_STORE,
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) =>
				createObjectStore(storageSettings(config)),
		},
	],
	exports: [OBJECT_STORE],
})
export class StorageModule {}
