import { Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import { ReferenceSeedService } from './reference-seed.service';
import { ReferenceSeedError } from './reference-seed.types';

export function validateReferenceSeedEnvironment(raw: Record<string, unknown>) {
	const mode = raw.NODE_ENV ?? 'development';
	if (mode === 'production')
		throw new ReferenceSeedError(
			'CONFIGURATION',
			'Production seeding awaits the approved ingestion authorization and audit policy',
		);
	if (mode !== 'development' && mode !== 'test')
		throw new ReferenceSeedError(
			'CONFIGURATION',
			'Invalid configuration: NODE_ENV',
		);
	const databaseUrl = raw.DATABASE_URL;
	try {
		if (typeof databaseUrl !== 'string' || /[\r\n\0]/.test(databaseUrl))
			throw new Error();
		const parsed = new URL(databaseUrl);
		if (
			!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
			!parsed.hostname
		)
			throw new Error();
	} catch {
		throw new ReferenceSeedError(
			'CONFIGURATION',
			'Invalid configuration: DATABASE_URL',
		);
	}
	return { NODE_ENV: mode, DATABASE_URL: databaseUrl };
}

@Module({})
class ReferenceSeedRuntimeModule {}

export async function createReferenceSeedRuntime() {
	let context: INestApplicationContext | undefined;
	let client: PrismaService | undefined;
	try {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
			ignoreEnvFile:
				process.env.NODE_ENV === 'test' ||
				process.env.NODE_ENV === 'production',
			skipProcessEnv: true,
			validate: validateReferenceSeedEnvironment,
		});
		context = await NestFactory.createApplicationContext(
			{
				module: ReferenceSeedRuntimeModule,
				imports: [config],
				providers: [
					{
						provide: PrismaService,
						inject: [ConfigService],
						useFactory: (
							settings: ConfigService<RuntimeEnvironment, true>,
						) => {
							client = new PrismaService(settings);
							return client;
						},
					},
					ReferenceSeedService,
				],
			},
			{ logger: false, abortOnError: false },
		);
		return {
			service: context.get(ReferenceSeedService),
			close: () => context!.close(),
		};
	} catch (error: unknown) {
		try {
			if (context) await context.close();
			else if (client) await client.onModuleDestroy();
		} catch {
			// Preserve the sanitized initialization error if cleanup also fails.
		}
		if (error instanceof ReferenceSeedError) throw error;
		throw new ReferenceSeedError(
			'STORAGE_UNAVAILABLE',
			'Seeder initialization failed; check environment configuration and database access',
		);
	}
}
