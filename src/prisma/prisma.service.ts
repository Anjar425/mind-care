import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	constructor(config: ConfigService<RuntimeEnvironment, true>) {
		const adapter = new PrismaPg({
			connectionString: config.get('DATABASE_URL', { infer: true }),
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
