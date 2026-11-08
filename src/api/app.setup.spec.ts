import { INestApplication } from '@nestjs/common';
import { setupApplication, type ApplicationSettings } from './app.setup';
import { setupSwagger } from './common/swagger/setup-swagger';
import { screeningPrivacyMiddleware } from './common/privacy/screening-privacy.middleware';

jest.mock('./common/swagger/setup-swagger', () => ({
	setupSwagger: jest.fn(),
}));

const DEVELOPMENT: ApplicationSettings = {
	NODE_ENV: 'development',
	CORS_ORIGIN: ['http://localhost:5173'],
	SWAGGER_MODE: 'public',
	TRUST_PROXY_HOPS: 0,
};
const PRODUCTION: ApplicationSettings = {
	NODE_ENV: 'production',
	CORS_ORIGIN: [],
	SWAGGER_MODE: 'off',
	TRUST_PROXY_HOPS: 1,
};

describe('setupApplication', () => {
	const express = { set: jest.fn() };
	const mock = {
		use: jest.fn(),
		setGlobalPrefix: jest.fn(),
		enableVersioning: jest.fn(),
		enableCors: jest.fn(),
		get: jest.fn(),
		getHttpAdapter: () => ({ getInstance: () => express }),
		useGlobalInterceptors: jest.fn(),
		useGlobalFilters: jest.fn(),
		useGlobalPipes: jest.fn(),
		enableShutdownHooks: jest.fn(),
	};
	const app = mock as unknown as INestApplication;
	afterEach(() => jest.clearAllMocks());

	it('should configure shutdown hooks and local middleware when development starts', () => {
		setupApplication(app, DEVELOPMENT);
		expect(mock.enableShutdownHooks).toHaveBeenCalledTimes(1);
		expect(mock.use).toHaveBeenCalledWith(
			'/api/v1/screenings',
			screeningPrivacyMiddleware,
		);
		expect(mock.enableCors).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: ['http://localhost:5173'],
				credentials: false,
			}),
		);
		expect(express.set).not.toHaveBeenCalled();
		expect(setupSwagger).toHaveBeenCalledWith(mock, 'public');
	});

	it('should start in production with same-origin, one trusted proxy and Swagger off', () => {
		expect(() => setupApplication(app, PRODUCTION)).not.toThrow();
		expect(mock.enableCors).not.toHaveBeenCalled();
		expect(express.set).toHaveBeenCalledWith('trust proxy', 1);
		expect(setupSwagger).toHaveBeenCalledWith(mock, 'off');
	});

	it('should allow every configured origin when several frontends are listed', () => {
		setupApplication(app, {
			...DEVELOPMENT,
			CORS_ORIGIN: ['http://localhost:5180', 'https://app.example.test'],
		});
		expect(mock.enableCors).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: ['http://localhost:5180', 'https://app.example.test'],
			}),
		);
	});
});
