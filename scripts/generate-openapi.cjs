// Writes docs/openapi.json from the compiled app (run `pnpm build` first so the
// @nestjs/swagger CLI plugin metadata is included, exactly as served at /docs).
// The app is created but never initialised: no database connection, no cron job.
// Usage: pnpm openapi:generate   (pnpm openapi:check fails if the committed file is stale)
'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, 'docs', 'openapi.json');

// Synthetic, non-secret values that only satisfy startup validation.
const SYNTHETIC_ENV = {
	NODE_ENV: 'test',
	PORT: '3000',
	DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:5432/openapi',
	JWT_ACCESS_SECRET: 'openapi-generation-access-secret-000000',
	JWT_REFRESH_SECRET: 'openapi-generation-refresh-secret-00000',
	FRONTEND_URL: 'http://localhost:5173',
	CORS_ORIGIN: 'http://localhost:5173',
	MAIL_HOST: 'smtp.invalid',
	MAIL_USER: 'openapi',
	MAIL_PASS: 'openapi',
	MAIL_FROM: 'openapi@example.invalid',
	RATE_LIMIT_WINDOW_MS: '60000',
	RATE_LIMIT_GENERAL: '120',
	RATE_LIMIT_LOGIN: '5',
	RATE_LIMIT_REGISTER: '3',
	RATE_LIMIT_FORGOT_PASSWORD: '3',
	RATE_LIMIT_SEND_VERIFICATION: '3',
	RATE_LIMIT_REFRESH: '30',
	HEALTH_CHECK_TIMEOUT_MS: '1000',
	CREDENTIAL_STORAGE_ROOT: '.private/openapi',
	CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
	CREDENTIAL_LOOKUP_KEY: 'b'.repeat(64),
};

function sortKeys(value) {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, sortKeys(value[key])]),
		);
	return value;
}

async function main() {
	// Replace the environment so a developer's .env or shell cannot leak into the output.
	for (const key of Object.keys(process.env))
		if (!['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP'].includes(key))
			delete process.env[key];
	Object.assign(process.env, SYNTHETIC_ENV);

	const { NestFactory } = require('@nestjs/core');
	const { AppModule } = require(resolve(ROOT, 'dist', 'app.module.js'));
	const { configureRouting } = require(
		resolve(ROOT, 'dist', 'api', 'app.setup.js'),
	);
	const { buildOpenApiDocument } = require(
		resolve(ROOT, 'dist', 'api', 'common', 'swagger', 'setup-swagger.js'),
	);
	const app = await NestFactory.create(AppModule, {
		logger: false,
		abortOnError: false,
	});
	try {
		// Same /api/v1 prefix and URI versioning as the running application.
		configureRouting(app);
		const document = sortKeys(buildOpenApiDocument(app));
		mkdirSync(dirname(OUTPUT), { recursive: true });
		writeFileSync(OUTPUT, `${JSON.stringify(document, null, '\t')}\n`);
	} finally {
		await app.close();
	}
}

main().catch((error) => {
	console.error(
		'OpenAPI generation failed:',
		error instanceof Error ? error.message : 'unknown error',
	);
	process.exitCode = 1;
});
