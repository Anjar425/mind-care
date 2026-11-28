import { validateEnvironment } from './environment.config';

const ACCESS = 'synthetic-access-secret-at-least-32-bytes';
const REFRESH = 'synthetic-refresh-secret-at-least-32-bytes';
const base = (): Record<string, string> => ({
	DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/test',
	JWT_ACCESS_SECRET: ACCESS,
	JWT_REFRESH_SECRET: REFRESH,
	FRONTEND_URL: 'http://localhost:5173',
	MAIL_HOST: 'smtp.example.test',
	MAIL_USER: 'synthetic',
	MAIL_PASS: 'synthetic',
	MAIL_FROM: 'test@example.test',
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
const without = (keys: string[]) => {
	const raw = base();
	for (const key of keys) delete raw[key];
	return raw;
};

describe('validateEnvironment key rings', () => {
	it('should turn the single secrets into one-key rings named k0', () => {
		const config = validateEnvironment(base());
		expect(config.JWT_ACCESS_KEYS).toEqual([{ kid: 'k0', secret: ACCESS }]);
		expect(config.JWT_REFRESH_KEYS).toEqual([
			{ kid: 'k0', secret: REFRESH },
		]);
		expect(config.CREDENTIAL_ENCRYPTION_KEYS).toEqual([
			{ kid: 'k0', secret: 'a'.repeat(64) },
		]);
	});

	it('should let a ring replace its single secret, the first key being current', () => {
		const config = validateEnvironment({
			...without([
				'JWT_ACCESS_SECRET',
				'JWT_REFRESH_SECRET',
				'CREDENTIAL_ENCRYPTION_KEY',
			]),
			JWT_ACCESS_KEYS: `k1:${'n'.repeat(40)},k0:${ACCESS}`,
			JWT_REFRESH_KEYS: `k1:${'r'.repeat(40)}`,
			CREDENTIAL_ENCRYPTION_KEYS: `k1:${'c'.repeat(64)},k0:${'a'.repeat(64)}`,
		});
		expect(config.JWT_ACCESS_SECRET).toBe('n'.repeat(40));
		expect(config.JWT_ACCESS_KEYS.map((key) => key.kid)).toEqual([
			'k1',
			'k0',
		]);
		expect(config.CREDENTIAL_ENCRYPTION_KEY).toBe('c'.repeat(64));
	});

	it.each([
		['JWT_ACCESS_KEYS', 'k1:short'],
		['JWT_ACCESS_KEYS', `k1:${ACCESS},k1:${'x'.repeat(40)}`],
		['JWT_REFRESH_KEYS', `k5:${ACCESS}`],
		['CREDENTIAL_ENCRYPTION_KEYS', 'k1:not-hex'],
		['CREDENTIAL_LOOKUP_KEY', `k1:${'c'.repeat(64)},k0:${'b'.repeat(64)}`],
	])('should name %s when the ring is invalid', (expected, value) => {
		const ringKey =
			expected === 'CREDENTIAL_LOOKUP_KEY'
				? 'CREDENTIAL_ENCRYPTION_KEYS'
				: expected;
		expect(() =>
			validateEnvironment({ ...base(), [ringKey]: value }),
		).toThrow(expected);
	});
});

describe('validateEnvironment object storage', () => {
	it('should default to local storage and an AWS region', () => {
		expect(validateEnvironment(base())).toEqual(
			expect.objectContaining({
				STORAGE_DRIVER: 'local',
				S3_BUCKET: '',
				S3_REGION: 'us-east-1',
				S3_ENDPOINT: '',
			}),
		);
	});

	it('should accept an S3-compatible bucket with static credentials', () => {
		expect(
			validateEnvironment({
				...base(),
				STORAGE_DRIVER: 's3',
				S3_BUCKET: 'mindcare-credentials',
				S3_ENDPOINT: 'http://127.0.0.1:9000',
				S3_ACCESS_KEY_ID: 'id',
				S3_SECRET_ACCESS_KEY: 'secret',
			}),
		).toEqual(
			expect.objectContaining({
				STORAGE_DRIVER: 's3',
				S3_BUCKET: 'mindcare-credentials',
			}),
		);
	});

	it.each([
		[{ STORAGE_DRIVER: 'disk' }, 'STORAGE_DRIVER'],
		[{ STORAGE_DRIVER: 's3' }, 'S3_BUCKET'],
		[{ STORAGE_DRIVER: 's3', S3_BUCKET: 'Bad_Bucket' }, 'S3_BUCKET'],
		[
			{
				STORAGE_DRIVER: 's3',
				S3_BUCKET: 'ok-bucket',
				S3_ACCESS_KEY_ID: 'id',
			},
			'S3_SECRET_ACCESS_KEY',
		],
		[{ S3_ENDPOINT: 'ftp://storage.example.test' }, 'S3_ENDPOINT'],
		[
			{ S3_ENDPOINT: 'https://user:pass@storage.example.test' },
			'S3_ENDPOINT',
		],
		[
			{
				NODE_ENV: 'production',
				FRONTEND_URL: 'https://mindcare.example.test',
				S3_ENDPOINT: 'http://storage.example.test',
			},
			'S3_ENDPOINT',
		],
	])('should reject %p', (overrides, key) => {
		expect(() => validateEnvironment({ ...base(), ...overrides })).toThrow(
			key,
		);
	});
});
