import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './database-url';

// Drops and recreates the test database schema from migrations, then seeds reference data
// with the compiled seeder CLI (global setup runs outside Jest's module mapping).
export default function globalSetup(): void {
	const url = testDatabaseUrl();
	const env: NodeJS.ProcessEnv = {
		...process.env,
		NODE_ENV: 'test',
		DATABASE_URL: url,
	};
	delete env.SHADOW_DATABASE_URL;
	const run = (command: string) =>
		execSync(command, { stdio: 'inherit', env });
	run('pnpm exec prisma migrate reset --force');
	run('pnpm build:seed');
	run('node dist/reference-seed/scripts/seed-reference-data.js --apply');
}
