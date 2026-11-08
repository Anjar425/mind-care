import { validateEnvironment } from './environment.config';

const valid = () => ({
	DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/test',
	JWT_ACCESS_SECRET: 'synthetic-access-secret-at-least-32-bytes',
	JWT_REFRESH_SECRET: 'synthetic-refresh-secret-at-least-32-bytes',
	FRONTEND_URL: 'http://localhost:5173',
	MAIL_HOST: 'smtp.example.test',
	MAIL_USER: 'synthetic',
	MAIL_PASS: 'synthetic',
	MAIL_FROM: 'test@example.test',
	CORS_ORIGIN: 'http://localhost:5173',
	RATE_LIMIT_WINDOW_MS: '60000',
	RATE_LIMIT_GENERAL: '120',
	RATE_LIMIT_LOGIN: '5',
	RATE_LIMIT_REGISTER: '3',
	RATE_LIMIT_FORGOT_PASSWORD: '3',
	RATE_LIMIT_SEND_VERIFICATION: '3',
	RATE_LIMIT_REFRESH: '30',
	HEALTH_CHECK_TIMEOUT_MS: '1000',
	CREDENTIAL_STORAGE_ROOT: '.private/credentials',
	CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
	CREDENTIAL_LOOKUP_KEY: 'b'.repeat(64),
});

describe('validateEnvironment', () => {
	it('should validate optional screening rate settings and retain reviewed local defaults without an env-file edit', () => {
		const config = validateEnvironment(valid());
		expect(config.RATE_LIMIT_SCREENING_QDSS).toBe(10);
		expect(config.RATE_LIMIT_SCREENING_DASS42).toBe(5);
		expect(
			validateEnvironment({ ...valid(), RATE_LIMIT_SCREENING_QDSS: '8' })
				.RATE_LIMIT_SCREENING_QDSS,
		).toBe(8);
		for (const key of [
			'RATE_LIMIT_SCREENING_QDSS',
			'RATE_LIMIT_SCREENING_DASS42',
		])
			for (const value of ['0', '1.5', 'NaN', ''])
				expect(() =>
					validateEnvironment({ ...valid(), [key]: value }),
				).toThrow(key);
	});
	it('should name FRONTEND_URL when only the retired APP_URL key is supplied', () => {
		const { FRONTEND_URL, ...rest } = valid();
		expect(() =>
			validateEnvironment({ ...rest, APP_URL: FRONTEND_URL }),
		).toThrow('FRONTEND_URL');
	});
	it('should strip a trailing slash from FRONTEND_URL', () => {
		expect(
			validateEnvironment({
				...valid(),
				FRONTEND_URL: 'https://app.example.test/',
			}).FRONTEND_URL,
		).toBe('https://app.example.test');
	});
	const production = () => {
		const rest: Record<string, string> = valid();
		delete rest.CORS_ORIGIN;
		return {
			...rest,
			NODE_ENV: 'production',
			FRONTEND_URL: 'https://mindcare.example.test',
		};
	};
	it('should start production as a same-origin deployment with Swagger off by default', () => {
		const config = validateEnvironment(production());
		expect(config).toEqual(
			expect.objectContaining({
				NODE_ENV: 'production',
				CORS_ORIGIN: [],
				SWAGGER_MODE: 'off',
				TRUST_PROXY_HOPS: 0,
			}),
		);
		expect(
			validateEnvironment({ ...production(), TRUST_PROXY_HOPS: '1' })
				.TRUST_PROXY_HOPS,
		).toBe(1);
	});
	it('should require https links and origins in production', () => {
		expect(() =>
			validateEnvironment({
				...production(),
				FRONTEND_URL: 'http://mindcare.example.test',
			}),
		).toThrow('FRONTEND_URL');
		expect(() =>
			validateEnvironment({
				...production(),
				CORS_ORIGIN: 'http://app.example.test',
			}),
		).toThrow('CORS_ORIGIN');
		expect(
			validateEnvironment({
				...production(),
				CORS_ORIGIN: 'https://app.example.test',
			}).CORS_ORIGIN,
		).toEqual(['https://app.example.test']);
	});
	it('should default CORS to the frontend origin outside production and accept a list', () => {
		const rest: Record<string, string> = valid();
		delete rest.CORS_ORIGIN;
		expect(validateEnvironment(rest).CORS_ORIGIN).toEqual([
			'http://localhost:5173',
		]);
		expect(
			validateEnvironment({
				...valid(),
				CORS_ORIGIN: 'http://localhost:5173, https://app.example.test',
			}).CORS_ORIGIN,
		).toEqual(['http://localhost:5173', 'https://app.example.test']);
		expect(
			validateEnvironment({ ...valid(), CORS_ORIGIN: '' }).CORS_ORIGIN,
		).toEqual([]);
	});
	it('should apply runtime defaults for tokens, sessions and the database pool', () => {
		expect(validateEnvironment(valid())).toEqual(
			expect.objectContaining({
				SWAGGER_MODE: 'public',
				ACCESS_TOKEN_TTL_SECONDS: 900,
				SESSION_TTL_DAYS: 7,
				DB_POOL_MAX: 10,
				DB_STATEMENT_TIMEOUT_MS: 15000,
				RATE_LIMIT_LOGIN_ACCOUNT: 10,
				RATE_LIMIT_EMAIL_ACCOUNT: 5,
				LOG_LEVEL: 'info',
				METRICS_PORT: 0,
				SECURITY_EVENT_RETENTION_DAYS: 365,
			}),
		);
	});
	it('should return typed settings when valid host configuration is supplied', () => {
		expect(validateEnvironment(valid())).toEqual(
			expect.objectContaining({
				NODE_ENV: 'development',
				PORT: 3000,
				MAIL_PORT: 587,
				MAIL_SECURE: false,
				VERIFICATION_TOKEN_EXPIRY_MINUTES: 15,
				RESET_TOKEN_EXPIRY_MINUTES: 15,
			}),
		);
	});
	it.each([
		['PORT', '0'],
		['PORT', '65536'],
		['PORT', '1.2'],
		['PORT', ''],
		['NODE_ENV', 'unknown'],
		['MAIL_PORT', '-1'],
		['MAIL_SECURE', 'yes'],
		['DATABASE_URL', 'https://example.test'],
		['FRONTEND_URL', 'http://user:pass@example.test'],
		['FRONTEND_URL', 'http://example.test/?token=synthetic'],
		['FRONTEND_URL', 'http://example.test/#token=synthetic'],
		['JWT_ACCESS_SECRET', 'short'],
		['JWT_REFRESH_SECRET', 'short'],
		['VERIFICATION_TOKEN_EXPIRY_MINUTES', 'NaN'],
		['RESET_TOKEN_EXPIRY_MINUTES', '-1'],
		['MAIL_FROM', 'sender\r\nInjected: value'],
		['CORS_ORIGIN', '*'],
		['CORS_ORIGIN', 'http://localhost:5173/path'],
		['CORS_ORIGIN', 'http://user:pass@localhost:5173'],
		['RATE_LIMIT_WINDOW_MS', '0'],
		['RATE_LIMIT_WINDOW_MS', '2147483648'],
		['RATE_LIMIT_GENERAL', '-1'],
		['RATE_LIMIT_LOGIN', '1.5'],
		['RATE_LIMIT_REGISTER', ''],
		['RATE_LIMIT_FORGOT_PASSWORD', 'NaN'],
		['RATE_LIMIT_SEND_VERIFICATION', '0'],
		['RATE_LIMIT_REFRESH', '0'],
		['HEALTH_CHECK_TIMEOUT_MS', '0'],
		['HEALTH_CHECK_TIMEOUT_MS', '2147483648'],
		['CREDENTIAL_STORAGE_ROOT', '../public'],
		['CREDENTIAL_STORAGE_ROOT', '.private/../../public'],
		['CREDENTIAL_ENCRYPTION_KEY', 'short'],
		['CREDENTIAL_LOOKUP_KEY', 'invalid'],
		['CREDENTIAL_LOOKUP_KEY', 'a'.repeat(64)],
		['CREDENTIAL_UPLOAD_MAX_BYTES', '5242881'],
		['CREDENTIAL_UPLOAD_RATE_LIMIT', '0'],
		['CREDENTIAL_REMINDER_LEAD_DAYS', '31'],
		['CREDENTIAL_REMINDER_HOUR', '24'],
		['RATE_LIMIT_LOGIN_ACCOUNT', '0'],
		['RATE_LIMIT_EMAIL_ACCOUNT', '1.5'],
		['LOG_LEVEL', 'verbose'],
		['METRICS_PORT', '3000'],
		['METRICS_PORT', '65536'],
		['SECURITY_EVENT_RETENTION_DAYS', '29'],
		['TRUST_PROXY_HOPS', '4'],
		['TRUST_PROXY_HOPS', '-1'],
		['SWAGGER_MODE', 'private'],
		['ACCESS_TOKEN_TTL_SECONDS', '299'],
		['ACCESS_TOKEN_TTL_SECONDS', '3601'],
		['SESSION_TTL_DAYS', '0'],
		['SESSION_TTL_DAYS', '31'],
		['DB_POOL_MAX', '0'],
		['DB_POOL_MAX', '51'],
		['DB_STATEMENT_TIMEOUT_MS', '999'],
		['DB_STATEMENT_TIMEOUT_MS', '60001'],
		['CORS_ORIGIN', 'http://localhost:5173,not-an-origin'],
	])(
		'should reject %s when its configured format is invalid (%s)',
		(key, value) => {
			expect(() =>
				validateEnvironment({ ...valid(), [key]: value }),
			).toThrow(key);
		},
	);
	it('should reject shared secrets when access and refresh settings are identical', () => {
		const config = valid();
		config.JWT_REFRESH_SECRET = config.JWT_ACCESS_SECRET;
		expect(() => validateEnvironment(config)).toThrow('JWT_REFRESH_SECRET');
	});
	it('should omit values when reporting missing or invalid configuration', () => {
		try {
			validateEnvironment({ MAIL_PASS: 'sensitive-synthetic-value' });
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).not.toContain(
				'sensitive-synthetic-value',
			);
			expect((error as Error).message).toContain('DATABASE_URL');
			return;
		}
		throw new Error('Expected validation failure');
	});
});
