import { randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { RuntimeEnvironment } from '../../src/infrastructure/config/environment.config';
import { syntheticConfig } from '../runtime-config.mock';
import { testDatabaseUrl } from './database-url';

export type Config = ConfigService<RuntimeEnvironment, true>;

const REFERENCE_TABLES = new Set([
	'DASS21',
	'DASS42',
	'Conclusion',
	'_prisma_migrations',
]);

export function dbConfig(overrides: Partial<RuntimeEnvironment> = {}): Config {
	const values: RuntimeEnvironment = {
		...syntheticConfig,
		DATABASE_URL: testDatabaseUrl(),
		...overrides,
	};
	return {
		get: (key: keyof RuntimeEnvironment) => values[key],
	} as unknown as Config;
}

export function createPrisma(): PrismaService {
	return new PrismaService(dbConfig());
}

// Empties every non-reference table; reference catalogs stay seeded.
export async function resetData(prisma: PrismaService): Promise<void> {
	const rows = await prisma.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
	const tables = rows
		.map((r) => r.tablename)
		.filter((name) => !REFERENCE_TABLES.has(name))
		.map((name) => `"public"."${name.replace(/"/g, '""')}"`);
	if (tables.length)
		await prisma.$executeRawUnsafe(
			`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
		);
}

export const PASSWORD = 'Passw0rd123';

export async function createUser(
	prisma: PrismaService,
	options: {
		role?: 'USER' | 'EXPERT' | 'ADMIN';
		verified?: boolean;
		name?: string;
	} = {},
) {
	return prisma.user.create({
		data: {
			name: options.name ?? 'Example User',
			email: `${randomUUID()}@example.test`,
			password: await bcrypt.hash(PASSWORD, 4),
			role: options.role ?? 'USER',
			email_verified_at: options.verified === false ? null : new Date(),
		},
	});
}

export function base64url(bytes: number): string {
	return randomBytes(bytes).toString('base64url');
}

// Resolves for every participant once `size` participants have arrived.
export function barrier(size: number) {
	let arrived = 0;
	let release!: () => void;
	const open = new Promise<void>((resolve) => (release = resolve));
	return {
		async arrive(): Promise<void> {
			arrived += 1;
			if (arrived >= size) release();
			await open;
		},
	};
}

export const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));
