import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../config/environment.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	constructor(config: ConfigService<RuntimeEnvironment, true>) {
		// The reference seeder supplies only DATABASE_URL; the defaults match environment.config.
		const timeout =
			config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true }) ?? 15000;
		const adapter = new PrismaPg({
			connectionString: config.get('DATABASE_URL', { infer: true }),
			max: config.get('DB_POOL_MAX', { infer: true }) ?? 10,
			// A runaway query or a transaction left open while holding locks is cut off.
			statement_timeout: timeout,
			idle_in_transaction_session_timeout: timeout,
		});
		super({ adapter });
	}

	async onModuleInit() {
		try {
			await this.$connect();
		} catch {
			throw new Error('Database initialization failed');
		}
	}

	async onModuleDestroy() {
		try {
			await this.$disconnect();
		} catch {
			throw new Error('Database shutdown failed');
		}
	}
}
