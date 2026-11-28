import { LEGACY_KID, parseKeyRing, type RingKey } from './key-ring';

export interface RuntimeEnvironment {
	NODE_ENV: 'development' | 'test' | 'production';
	PORT: number;
	DATABASE_URL: string;
	// Current signing secrets (first entry of each ring).
	JWT_ACCESS_SECRET: string;
	JWT_REFRESH_SECRET: string;
	// Key rings: the first key signs, every key verifies (by the token's `kid`).
	JWT_ACCESS_KEYS: RingKey[];
	JWT_REFRESH_KEYS: RingKey[];
	// Public base URL of the web frontend; email links point to its pages.
	FRONTEND_URL: string;
	MAIL_HOST: string;
	MAIL_PORT: number;
	MAIL_SECURE: boolean;
	MAIL_USER: string;
	MAIL_PASS: string;
	MAIL_FROM: string;
	VERIFICATION_TOKEN_EXPIRY_MINUTES: number;
	RESET_TOKEN_EXPIRY_MINUTES: number;
	// Browser origins allowed by CORS (comma list). Empty: CORS off, same-origin deployment.
	CORS_ORIGIN: string[];
	RATE_LIMIT_WINDOW_MS: number;
	RATE_LIMIT_GENERAL: number;
	RATE_LIMIT_LOGIN: number;
	RATE_LIMIT_REGISTER: number;
	RATE_LIMIT_FORGOT_PASSWORD: number;
	RATE_LIMIT_SEND_VERIFICATION: number;
	RATE_LIMIT_REFRESH: number;
	RATE_LIMIT_SCREENING_QDSS: number;
	RATE_LIMIT_SCREENING_DASS42: number;
	// Per submitted email, whatever the client IP.
	RATE_LIMIT_LOGIN_ACCOUNT: number;
	RATE_LIMIT_EMAIL_ACCOUNT: number;
	HEALTH_CHECK_TIMEOUT_MS: number;
	CREDENTIAL_STORAGE_ROOT: string;
	// Current sealing key (first entry of the ring).
	CREDENTIAL_ENCRYPTION_KEY: string;
	CREDENTIAL_ENCRYPTION_KEYS: RingKey[];
	CREDENTIAL_LOOKUP_KEY: string;
	CREDENTIAL_UPLOAD_MAX_BYTES: number;
	CREDENTIAL_UPLOAD_RATE_LIMIT: number;
	CREDENTIAL_REMINDER_LEAD_DAYS: number;
	CREDENTIAL_REMINDER_HOUR: number;
	// Reverse proxies in front of the API whose X-Forwarded-For is trusted (0 = none).
	TRUST_PROXY_HOPS: number;
	// 'public' serves /docs; 'off' disables it. Default: off in production.
	SWAGGER_MODE: 'public' | 'off';
	ACCESS_TOKEN_TTL_SECONDS: number;
	SESSION_TTL_DAYS: number;
	DB_POOL_MAX: number;
	// Also bounds how long a transaction may sit idle while holding locks.
	DB_STATEMENT_TIMEOUT_MS: number;
	LOG_LEVEL:
		'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
	// Internal Prometheus endpoint port; 0 disables it. Never the public PORT.
	METRICS_PORT: number;
	SECURITY_EVENT_RETENTION_DAYS: number;
	// Credential documents: 'local' (.private, single instance) or 's3' (shared bucket).
	STORAGE_DRIVER: 'local' | 's3';
	S3_BUCKET: string;
	S3_REGION: string;
	// Empty for AWS S3; set for S3-compatible services (RustFS, R2, ...).
	S3_ENDPOINT: string;
	// Empty: the AWS default credential chain is used.
	S3_ACCESS_KEY_ID: string;
	S3_SECRET_ACCESS_KEY: string;
}

// Errors identify settings, never their submitted values.
export function validateEnvironment(
	raw: Record<string, unknown>,
): RuntimeEnvironment {
	const invalid = new Set<string>();
	function text(key: string): string {
		const value = raw[key];
		if (
			typeof value !== 'string' ||
			!value.trim() ||
			/[\r\n\0]/.test(value)
		) {
			invalid.add(key);
			return '';
		}
		return value;
	}
	function integer(
		key: string,
		fallback: number | undefined,
		max: number,
	): number {
		const value = Number(raw[key] ?? fallback);
		if (
			!Number.isSafeInteger(value) ||
			value <= 0 ||
			value > max ||
			(raw[key] !== undefined &&
				(typeof raw[key] !== 'string' || !/^\d+$/.test(raw[key])))
		)
			invalid.add(key);
		return value;
	}
	function bounded(
		key: string,
		fallback: number,
		min: number,
		max: number,
	): number {
		const value = raw[key] === undefined ? fallback : Number(raw[key]);
		if (
			(raw[key] !== undefined &&
				(typeof raw[key] !== 'string' || !/^\d+$/.test(raw[key]))) ||
			!Number.isSafeInteger(value) ||
			value < min ||
			value > max
		)
			invalid.add(key);
		return value;
	}
	function url(key: string, protocols: string[]): string {
		const value = text(key);
		try {
			const parsed = new URL(value);
			if (
				!protocols.includes(parsed.protocol) ||
				!parsed.hostname ||
				(key === 'FRONTEND_URL' &&
					(parsed.username ||
						parsed.password ||
						parsed.search ||
						parsed.hash))
			)
				invalid.add(key);
		} catch {
			invalid.add(key);
		}
		return value;
	}
	// Comma-separated bare origins. Unset: the frontend origin outside production and no CORS
	// (same-origin deployment) in production. An explicitly empty value disables CORS.
	function origins(
		key: string,
		frontend: string,
		production: boolean,
	): string[] {
		const value = raw[key];
		if (value === undefined) {
			if (production || !frontend) return [];
			try {
				return [new URL(frontend).origin];
			} catch {
				return [];
			}
		}
		if (typeof value !== 'string' || /[\r\n\0]/.test(value)) {
			invalid.add(key);
			return [];
		}
		const list = value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
		for (const entry of list)
			try {
				const parsed = new URL(entry);
				if (
					!['http:', 'https:'].includes(parsed.protocol) ||
					parsed.origin !== entry
				)
					invalid.add(key);
			} catch {
				invalid.add(key);
			}
		return [...new Set(list)];
	}
	const mode = raw.NODE_ENV ?? 'development';
	if (mode !== 'development' && mode !== 'test' && mode !== 'production')
		invalid.add('NODE_ENV');
	// A ring setting (`kid:secret,...`) replaces its single-secret setting; the single secret
	// alone is the ring [k0]. Errors name whichever setting was used.
	function ring(
		ringKey: string,
		singleKey: string,
		valid: (secret: string) => boolean,
	): RingKey[] {
		if (raw[ringKey] !== undefined) {
			const parsed = parseKeyRing(raw[ringKey], valid);
			if (parsed) return parsed;
			invalid.add(ringKey);
			return [];
		}
		const single = raw[singleKey];
		if (
			typeof single === 'string' &&
			!/[\r\n\0]/.test(single) &&
			valid(single)
		)
			return [{ kid: LEGACY_KID, secret: single }];
		invalid.add(singleKey);
		return [];
	}
	const jwtSecret = (secret: string) => Buffer.byteLength(secret) >= 32;
	const accessKeys = ring('JWT_ACCESS_KEYS', 'JWT_ACCESS_SECRET', jwtSecret);
	const refreshKeys = ring(
		'JWT_REFRESH_KEYS',
		'JWT_REFRESH_SECRET',
		jwtSecret,
	);
	if (accessKeys.some((a) => refreshKeys.some((r) => r.secret === a.secret)))
		invalid.add(
			raw.JWT_REFRESH_KEYS !== undefined
				? 'JWT_REFRESH_KEYS'
				: 'JWT_REFRESH_SECRET',
		);
	const hexKey = (secret: string) => /^[a-fA-F0-9]{64}$/.test(secret);
	const encryptionKeys = ring(
		'CREDENTIAL_ENCRYPTION_KEYS',
		'CREDENTIAL_ENCRYPTION_KEY',
		hexKey,
	);
	const storageDriver = raw.STORAGE_DRIVER ?? 'local';
	if (storageDriver !== 'local' && storageDriver !== 's3')
		invalid.add('STORAGE_DRIVER');
	const optionalText = (key: string): string =>
		raw[key] === undefined || raw[key] === '' ? '' : text(key);
	const secure = raw.MAIL_SECURE ?? 'false';
	if (secure !== 'true' && secure !== 'false') invalid.add('MAIL_SECURE');
	const production = mode === 'production';
	const frontendUrl = url('FRONTEND_URL', ['http:', 'https:']).replace(
		/\/$/,
		'',
	);
	const corsOrigins = origins('CORS_ORIGIN', frontendUrl, production);
	const logLevel = raw.LOG_LEVEL ?? 'info';
	if (
		typeof logLevel !== 'string' ||
		![
			'fatal',
			'error',
			'warn',
			'info',
			'debug',
			'trace',
			'silent',
		].includes(logLevel)
	)
		invalid.add('LOG_LEVEL');
	const swagger = raw.SWAGGER_MODE ?? (production ? 'off' : 'public');
	if (swagger !== 'public' && swagger !== 'off') invalid.add('SWAGGER_MODE');
	const config: RuntimeEnvironment = {
		NODE_ENV: mode as RuntimeEnvironment['NODE_ENV'],
		CREDENTIAL_STORAGE_ROOT: text('CREDENTIAL_STORAGE_ROOT'),
		CREDENTIAL_ENCRYPTION_KEY: encryptionKeys[0]?.secret ?? '',
		CREDENTIAL_ENCRYPTION_KEYS: encryptionKeys,
		CREDENTIAL_LOOKUP_KEY: text('CREDENTIAL_LOOKUP_KEY'),
		CREDENTIAL_UPLOAD_MAX_BYTES: integer(
			'CREDENTIAL_UPLOAD_MAX_BYTES',
			5242880,
			5242880,
		),
		CREDENTIAL_UPLOAD_RATE_LIMIT: integer(
			'CREDENTIAL_UPLOAD_RATE_LIMIT',
			3,
			120,
		),
		CREDENTIAL_REMINDER_LEAD_DAYS: integer(
			'CREDENTIAL_REMINDER_LEAD_DAYS',
			30,
			30,
		),
		CREDENTIAL_REMINDER_HOUR: integer('CREDENTIAL_REMINDER_HOUR', 9, 23),
		PORT: integer('PORT', 3000, 65535),
		DATABASE_URL: url('DATABASE_URL', ['postgres:', 'postgresql:']),
		JWT_ACCESS_SECRET: accessKeys[0]?.secret ?? '',
		JWT_REFRESH_SECRET: refreshKeys[0]?.secret ?? '',
		JWT_ACCESS_KEYS: accessKeys,
		JWT_REFRESH_KEYS: refreshKeys,
		FRONTEND_URL: frontendUrl,
		MAIL_HOST: text('MAIL_HOST'),
		MAIL_PORT: integer('MAIL_PORT', 587, 65535),
		MAIL_SECURE: secure === 'true',
		MAIL_USER: text('MAIL_USER'),
		MAIL_PASS: text('MAIL_PASS'),
		MAIL_FROM: text('MAIL_FROM'),
		VERIFICATION_TOKEN_EXPIRY_MINUTES: integer(
			'VERIFICATION_TOKEN_EXPIRY_MINUTES',
			15,
			Math.floor((8.64e15 - Date.now()) / 60000),
		),
		RESET_TOKEN_EXPIRY_MINUTES: integer(
			'RESET_TOKEN_EXPIRY_MINUTES',
			15,
			Math.floor((8.64e15 - Date.now()) / 60000),
		),
		CORS_ORIGIN: corsOrigins,
		RATE_LIMIT_WINDOW_MS: integer(
			'RATE_LIMIT_WINDOW_MS',
			undefined,
			2147483647,
		),
		RATE_LIMIT_GENERAL: integer(
			'RATE_LIMIT_GENERAL',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_LOGIN: integer(
			'RATE_LIMIT_LOGIN',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_REGISTER: integer(
			'RATE_LIMIT_REGISTER',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_FORGOT_PASSWORD: integer(
			'RATE_LIMIT_FORGOT_PASSWORD',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_SEND_VERIFICATION: integer(
			'RATE_LIMIT_SEND_VERIFICATION',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_REFRESH: integer(
			'RATE_LIMIT_REFRESH',
			undefined,
			Number.MAX_SAFE_INTEGER,
		),
		HEALTH_CHECK_TIMEOUT_MS: integer(
			'HEALTH_CHECK_TIMEOUT_MS',
			undefined,
			2147483647,
		),
		RATE_LIMIT_SCREENING_QDSS: integer(
			'RATE_LIMIT_SCREENING_QDSS',
			10,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_SCREENING_DASS42: integer(
			'RATE_LIMIT_SCREENING_DASS42',
			5,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_LOGIN_ACCOUNT: integer(
			'RATE_LIMIT_LOGIN_ACCOUNT',
			10,
			Number.MAX_SAFE_INTEGER,
		),
		RATE_LIMIT_EMAIL_ACCOUNT: integer(
			'RATE_LIMIT_EMAIL_ACCOUNT',
			5,
			Number.MAX_SAFE_INTEGER,
		),
		TRUST_PROXY_HOPS: bounded('TRUST_PROXY_HOPS', 0, 0, 3),
		SWAGGER_MODE: swagger as RuntimeEnvironment['SWAGGER_MODE'],
		ACCESS_TOKEN_TTL_SECONDS: bounded(
			'ACCESS_TOKEN_TTL_SECONDS',
			900,
			300,
			3600,
		),
		SESSION_TTL_DAYS: bounded('SESSION_TTL_DAYS', 7, 1, 30),
		DB_POOL_MAX: bounded('DB_POOL_MAX', 10, 1, 50),
		DB_STATEMENT_TIMEOUT_MS: bounded(
			'DB_STATEMENT_TIMEOUT_MS',
			15000,
			1000,
			60000,
		),
		LOG_LEVEL: logLevel as RuntimeEnvironment['LOG_LEVEL'],
		METRICS_PORT: bounded('METRICS_PORT', 0, 0, 65535),
		SECURITY_EVENT_RETENTION_DAYS: bounded(
			'SECURITY_EVENT_RETENTION_DAYS',
			365,
			30,
			3650,
		),
		STORAGE_DRIVER: storageDriver as RuntimeEnvironment['STORAGE_DRIVER'],
		S3_BUCKET: optionalText('S3_BUCKET'),
		S3_REGION: optionalText('S3_REGION') || 'us-east-1',
		S3_ENDPOINT: optionalText('S3_ENDPOINT'),
		S3_ACCESS_KEY_ID: optionalText('S3_ACCESS_KEY_ID'),
		S3_SECRET_ACCESS_KEY: optionalText('S3_SECRET_ACCESS_KEY'),
	};
	if (!hexKey(config.CREDENTIAL_LOOKUP_KEY))
		invalid.add('CREDENTIAL_LOOKUP_KEY');
	if (
		encryptionKeys.some(
			(key) =>
				key.secret.toLowerCase() ===
				config.CREDENTIAL_LOOKUP_KEY.toLowerCase(),
		)
	)
		invalid.add('CREDENTIAL_LOOKUP_KEY');
	if (config.STORAGE_DRIVER === 's3') {
		if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.S3_BUCKET))
			invalid.add('S3_BUCKET');
		if (!config.S3_ACCESS_KEY_ID !== !config.S3_SECRET_ACCESS_KEY)
			invalid.add('S3_SECRET_ACCESS_KEY');
	}
	if (config.S3_ENDPOINT)
		try {
			const endpoint = new URL(config.S3_ENDPOINT);
			if (
				!['http:', 'https:'].includes(endpoint.protocol) ||
				endpoint.username ||
				endpoint.password ||
				(production && endpoint.protocol !== 'https:')
			)
				invalid.add('S3_ENDPOINT');
		} catch {
			invalid.add('S3_ENDPOINT');
		}
	if (!/^\.private\/[a-zA-Z0-9_-]+$/.test(config.CREDENTIAL_STORAGE_ROOT))
		invalid.add('CREDENTIAL_STORAGE_ROOT');
	if (config.METRICS_PORT !== 0 && config.METRICS_PORT === config.PORT)
		invalid.add('METRICS_PORT');
	// Production serves real users over TLS: links and allowed origins must be https.
	if (production && !config.FRONTEND_URL.startsWith('https://'))
		invalid.add('FRONTEND_URL');
	if (production && config.CORS_ORIGIN.some((o) => !o.startsWith('https://')))
		invalid.add('CORS_ORIGIN');
	if (invalid.size)
		throw new Error(
			`Invalid configuration: ${[...invalid].sort().join(', ')}`,
		);
	return config;
}
