import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const EXAMPLE = 'postgresql://mindcare:mindcare@127.0.0.1:5432/mindcare_test';

// Process env wins; otherwise only this one key is read from .env (DATABASE_URL is never used).
function configuredUrl(): string | undefined {
	if (process.env.DB_TEST_DATABASE_URL)
		return process.env.DB_TEST_DATABASE_URL;
	const file = resolve(__dirname, '..', '..', '.env');
	if (!existsSync(file)) return undefined;
	return parse(readFileSync(file)).DB_TEST_DATABASE_URL || undefined;
}

// Safety guard shared by global setup and specs: refuse anything but a "*_test" database.
export function testDatabaseUrl(): string {
	const raw = configuredUrl();
	if (!raw)
		throw new Error(
			`DB_TEST_DATABASE_URL is required for real-PostgreSQL tests. Add it to .env, e.g. DB_TEST_DATABASE_URL=${EXAMPLE} (start the database with: docker compose up -d postgres)`,
		);
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('DB_TEST_DATABASE_URL is not a valid URL');
	}
	const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
	if (
		!['postgres:', 'postgresql:'].includes(url.protocol) ||
		!/^[A-Za-z0-9_]+_test$/.test(database)
	)
		throw new Error(
			'DB_TEST_DATABASE_URL must be a PostgreSQL URL whose database name ends in "_test"; refusing to reset it',
		);
	return raw;
}
