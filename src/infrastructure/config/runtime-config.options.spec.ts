import fs from 'node:fs';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createRuntimeConfigOptions } from './runtime-config.options';
import { syntheticConfig } from '../../../test/runtime-config.mock';

describe('Runtime configuration loading', () => {
	let module: TestingModule | undefined;
	afterEach(async () => {
		await module?.close();
		module = undefined;
		jest.restoreAllMocks();
	});

	it('should load and validate a synthetic env file when development settings are absent from the host', async () => {
		const contents = Object.entries({
			...syntheticConfig,
			NODE_ENV: 'development',
			RATE_LIMIT_LOGIN: 7,
		})
			.map(([name, value]) => `${name}=${String(value)}`)
			.join('\n');
		const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		const read = jest
			.spyOn(fs, 'readFileSync')
			.mockReturnValue(Buffer.from(contents));
		const configured = await ConfigModule.forRoot({
			...createRuntimeConfigOptions('development'),
			ignoreEnvVars: true,
		});
		// Release filesystem mocks before Nest creates providers. No real .env was read.
		exists.mockRestore();
		read.mockRestore();
		module = await Test.createTestingModule({
			imports: [configured],
		}).compile();
		const config = module.get(ConfigService);
		expect(config.get<number>('RATE_LIMIT_LOGIN')).toBe(7);
		expect(config.get<number>('PORT')).toBe(3000);
		expect(config.get<boolean>('MAIL_SECURE')).toBe(false);
		expect(config.get<string>('CORS_ORIGIN')).toBe('http://localhost:5173');
	});

	it('should reject an invalid synthetic env file when startup configuration is loaded', async () => {
		jest.spyOn(fs, 'existsSync').mockReturnValue(true);
		jest.spyOn(fs, 'readFileSync').mockReturnValue(
			Buffer.from('RATE_LIMIT_LOGIN=invalid\n'),
		);
		await expect(
			ConfigModule.forRoot({
				...createRuntimeConfigOptions('development'),
				ignoreEnvVars: true,
			}),
		).rejects.toThrow('Invalid configuration:');
	});

	it.each(['test', 'production'])(
		'should avoid env-file access when the host mode is %s',
		async (mode) => {
			const originalRead = fs.readFileSync;
			const read = jest
				.spyOn(fs, 'readFileSync')
				.mockImplementation((path, options) => {
					if (String(path) === '.env')
						throw new Error('Unexpected environment-file access');
					return originalRead(path, options);
				});
			await expect(
				ConfigModule.forRoot({
					...createRuntimeConfigOptions(mode),
					ignoreEnvVars: true,
				}),
			).rejects.toThrow('Invalid configuration:');
			expect(
				read.mock.calls.filter(([path]) => String(path) === '.env'),
			).toHaveLength(0);
		},
	);
});
