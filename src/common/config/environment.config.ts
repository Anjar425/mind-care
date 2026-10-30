export interface RuntimeEnvironment {
	NODE_ENV: 'development' | 'test' | 'production';
	PORT: number;
	DATABASE_URL: string;
	JWT_ACCESS_SECRET: string;
	JWT_REFRESH_SECRET: string;
	APP_URL: string;
	MAIL_HOST: string;
	MAIL_PORT: number;
	MAIL_SECURE: boolean;
	MAIL_USER: string;
	MAIL_PASS: string;
	MAIL_FROM: string;
	VERIFICATION_TOKEN_EXPIRY_MINUTES: number;
	RESET_TOKEN_EXPIRY_MINUTES: number;
	CORS_ORIGIN: string;
	RATE_LIMIT_WINDOW_MS: number;
	RATE_LIMIT_GENERAL: number;
	RATE_LIMIT_LOGIN: number;
	RATE_LIMIT_REGISTER: number;
	RATE_LIMIT_FORGOT_PASSWORD: number;
	RATE_LIMIT_SEND_VERIFICATION: number;
	RATE_LIMIT_REFRESH: number;
	HEALTH_CHECK_TIMEOUT_MS: number;
	CREDENTIAL_STORAGE_ROOT: string;
	CREDENTIAL_ENCRYPTION_KEY: string;
	CREDENTIAL_LOOKUP_KEY: string;
	CREDENTIAL_UPLOAD_MAX_BYTES: number;
	CREDENTIAL_UPLOAD_RATE_LIMIT: number;
	CREDENTIAL_REMINDER_LEAD_DAYS: number;
	CREDENTIAL_REMINDER_HOUR: number;
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
	function url(key: string, protocols: string[]): string {
		const value = text(key);
		try {
			const parsed = new URL(value);
			if (
				!protocols.includes(parsed.protocol) ||
				!parsed.hostname ||
				(key === 'APP_URL' &&
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
	const mode = raw.NODE_ENV ?? 'development';
	if (mode !== 'development' && mode !== 'test' && mode !== 'production')
		invalid.add('NODE_ENV');
	const access = text('JWT_ACCESS_SECRET');
	const refresh = text('JWT_REFRESH_SECRET');
	if (Buffer.byteLength(access) < 32) invalid.add('JWT_ACCESS_SECRET');
	if (Buffer.byteLength(refresh) < 32 || refresh === access)
		invalid.add('JWT_REFRESH_SECRET');
	const secure = raw.MAIL_SECURE ?? 'false';
	if (secure !== 'true' && secure !== 'false') invalid.add('MAIL_SECURE');
	const corsOrigin = url('CORS_ORIGIN', ['http:', 'https:']);
	try {
		if (new URL(corsOrigin).origin !== corsOrigin)
			invalid.add('CORS_ORIGIN');
	} catch {
		invalid.add('CORS_ORIGIN');
	}
	const config: RuntimeEnvironment = {
		NODE_ENV: mode as RuntimeEnvironment['NODE_ENV'],
		CREDENTIAL_STORAGE_ROOT: text('CREDENTIAL_STORAGE_ROOT'),
		CREDENTIAL_ENCRYPTION_KEY: text('CREDENTIAL_ENCRYPTION_KEY'),
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
		JWT_ACCESS_SECRET: access,
		JWT_REFRESH_SECRET: refresh,
		APP_URL: url('APP_URL', ['http:', 'https:']).replace(/\/$/, ''),
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
		CORS_ORIGIN: corsOrigin,
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
	};
	for (const key of [
		'CREDENTIAL_ENCRYPTION_KEY',
		'CREDENTIAL_LOOKUP_KEY',
	] as const) {
		if (!/^[a-fA-F0-9]{64}$/.test(config[key])) invalid.add(key);
	}
	if (
		config.CREDENTIAL_ENCRYPTION_KEY.toLowerCase() ===
		config.CREDENTIAL_LOOKUP_KEY.toLowerCase()
	)
		invalid.add('CREDENTIAL_LOOKUP_KEY');
	if (!/^\.private\/[a-zA-Z0-9_-]+$/.test(config.CREDENTIAL_STORAGE_ROOT))
		invalid.add('CREDENTIAL_STORAGE_ROOT');
	if (invalid.size)
		throw new Error(
			`Invalid configuration: ${[...invalid].sort().join(', ')}`,
		);
	if (config.NODE_ENV === 'production')
		throw new Error('Production runtime policy is pending approval');
	return config;
}
