import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import {
	createReferenceSeedRuntime,
	validateReferenceSeedEnvironment,
} from './reference-seed.runtime';
import { ReferenceSeedService } from './reference-seed.service';
import { ReferenceSeedError } from './reference-seed.types';
import type { PrismaService } from '../prisma/prisma.service';

describe('Reference seeder runtime', () => {
	afterEach(() => jest.restoreAllMocks());
	it('should accept only the needed settings when local database configuration is valid', () => {
		expect(
			validateReferenceSeedEnvironment({
				DATABASE_URL: 'postgresql://test:test@localhost/unit',
			}),
		).toEqual({
			NODE_ENV: 'development',
			DATABASE_URL: 'postgresql://test:test@localhost/unit',
		});
	});
	it.each([
		{},
		{ DATABASE_URL: '' },
		{ DATABASE_URL: 'https://example.test' },
		{ DATABASE_URL: 'private-invalid-value' },
		{ NODE_ENV: 'invalid', DATABASE_URL: 'postgresql://localhost/unit' },
	])(
		'should identify setting names without values when configuration is %p',
		(input) => {
			expect(() => validateReferenceSeedEnvironment(input)).toThrow(
				ReferenceSeedError,
			);
			try {
				validateReferenceSeedEnvironment(input);
			} catch (error) {
				expect((error as Error).message).not.toContain(
					'private-invalid-value',
				);
			}
		},
	);
	it('should block production when ingestion authorization and audit policy remain undecided', () => {
		expect(() =>
			validateReferenceSeedEnvironment({
				NODE_ENV: 'production',
				DATABASE_URL: 'postgresql://localhost/unit',
			}),
		).toThrow('Production seeding awaits');
	});
	it('should create only the operator context when its mocked dependencies initialize', async () => {
		const close = jest.fn().mockResolvedValue(undefined);
		const service = { run: jest.fn() };
		const get = jest.fn().mockReturnValue(service);
		jest.spyOn(ConfigModule, 'forRoot').mockResolvedValue({
			module: ConfigModule,
		});
		const create = jest
			.spyOn(NestFactory, 'createApplicationContext')
			.mockResolvedValue({
				get,
				close,
			} as unknown as INestApplicationContext);
		const runtime = await createReferenceSeedRuntime();
		expect(runtime.service).toBe(service);
		expect(get).toHaveBeenCalledWith(ReferenceSeedService);
		await runtime.close();
		expect(close).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0][1]).toEqual({
			logger: false,
			abortOnError: false,
		});
	});
	it('should hide initialization errors when the mocked container rejects', async () => {
		jest.spyOn(ConfigModule, 'forRoot').mockResolvedValue({
			module: ConfigModule,
		});
		jest.spyOn(NestFactory, 'createApplicationContext').mockRejectedValue(
			new Error('PRIVATE_PROVIDER_FAILURE'),
		);
		await expect(createReferenceSeedRuntime()).rejects.toEqual(
			new ReferenceSeedError(
				'STORAGE_UNAVAILABLE',
				'Seeder initialization failed; check environment configuration and database access',
			),
		);
	});
	it('should close an existing context when service resolution fails', async () => {
		const close = jest.fn().mockResolvedValue(undefined);
		jest.spyOn(ConfigModule, 'forRoot').mockResolvedValue({
			module: ConfigModule,
		});
		jest.spyOn(NestFactory, 'createApplicationContext').mockResolvedValue({
			close,
			get: () => {
				throw new Error('PRIVATE_RESOLUTION_FAILURE');
			},
		} as unknown as INestApplicationContext);
		await expect(createReferenceSeedRuntime()).rejects.toMatchObject({
			code: 'STORAGE_UNAVAILABLE',
		});
		expect(close).toHaveBeenCalledTimes(1);
	});
	it('should disconnect a partially initialized client when container startup rejects', async () => {
		const disconnect = jest
			.fn<Promise<void>, []>()
			.mockResolvedValue(undefined);
		jest.spyOn(ConfigModule, 'forRoot').mockResolvedValue({
			module: ConfigModule,
		});
		jest.spyOn(NestFactory, 'createApplicationContext').mockImplementation(
			(options) => {
				const definition = options as {
					providers: {
						useFactory: (config: unknown) => PrismaService;
					}[];
				};
				const client = definition.providers[0].useFactory({
					get: jest.fn(),
				});
				client.onModuleDestroy = disconnect;
				return Promise.reject(
					new Error('PRIVATE_INITIALIZATION_FAILURE'),
				);
			},
		);
		await expect(createReferenceSeedRuntime()).rejects.toMatchObject({
			code: 'STORAGE_UNAVAILABLE',
		});
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
