import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../src/common/config/environment.config';

export const syntheticConfig: RuntimeEnvironment = {
	NODE_ENV: 'test',
	PORT: 3000,
	DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/test',
	JWT_ACCESS_SECRET: 'synthetic-access-key-for-auth-tests',
	JWT_REFRESH_SECRET: 'synthetic-refresh-key-for-auth-tests',
	APP_URL: 'http://localhost:5173',
	MAIL_HOST: 'smtp.example.test',
	MAIL_PORT: 587,
	MAIL_SECURE: false,
	MAIL_USER: 'synthetic',
	MAIL_PASS: 'synthetic',
	MAIL_FROM: 'test@example.test',
	VERIFICATION_TOKEN_EXPIRY_MINUTES: 15,
	RESET_TOKEN_EXPIRY_MINUTES: 15,
	CORS_ORIGIN: 'http://localhost:5173',
	RATE_LIMIT_WINDOW_MS: 60000,
	RATE_LIMIT_GENERAL: 120,
	RATE_LIMIT_LOGIN: 5,
	RATE_LIMIT_REGISTER: 3,
	RATE_LIMIT_FORGOT_PASSWORD: 3,
	RATE_LIMIT_SEND_VERIFICATION: 3,
	RATE_LIMIT_REFRESH: 30,
	HEALTH_CHECK_TIMEOUT_MS: 1000,
	CREDENTIAL_STORAGE_ROOT: '.private/credentials',
	CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
	CREDENTIAL_LOOKUP_KEY: 'b'.repeat(64),
	CREDENTIAL_UPLOAD_MAX_BYTES: 5242880,
	CREDENTIAL_UPLOAD_RATE_LIMIT: 3,
	CREDENTIAL_REMINDER_LEAD_DAYS: 30,
	CREDENTIAL_REMINDER_HOUR: 9,
};
export const runtimeConfigMock = {
	get: jest.fn((key: keyof RuntimeEnvironment) => syntheticConfig[key]),
};
export const runtimeConfigProvider = {
	provide: ConfigService,
	useValue: runtimeConfigMock,
};
