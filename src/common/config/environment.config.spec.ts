import { validateEnvironment } from './environment.config';

const valid = () => ({
	DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/test',
	JWT_ACCESS_SECRET: 'synthetic-access-secret-at-least-32-bytes',
	JWT_REFRESH_SECRET: 'synthetic-refresh-secret-at-least-32-bytes',
	APP_URL: 'http://localhost:5173',
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
	it('should gate production startup when its runtime policy has not been approved', () => {
		expect(() =>
			validateEnvironment({ ...valid(), NODE_ENV: 'production' }),
		).toThrow('Production runtime policy is pending approval');
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
		['APP_URL', 'http://user:pass@example.test'],
		['APP_URL', 'http://example.test/?token=synthetic'],
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
