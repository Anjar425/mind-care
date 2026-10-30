import { INestApplication } from '@nestjs/common';
import { setupApplication } from './app.setup';
import { setupSwagger } from './swagger/setup-swagger';

jest.mock('./swagger/setup-swagger', () => ({ setupSwagger: jest.fn() }));

describe('setupApplication', () => {
	const mock = {
		use: jest.fn(),
		enableCors: jest.fn(),
		get: jest.fn(),
		useGlobalInterceptors: jest.fn(),
		useGlobalFilters: jest.fn(),
		useGlobalPipes: jest.fn(),
		enableShutdownHooks: jest.fn(),
	};
	afterEach(() => jest.clearAllMocks());
	it('should configure shutdown hooks and local middleware when development starts', () => {
		setupApplication(mock as unknown as INestApplication, {
			NODE_ENV: 'development',
			CORS_ORIGIN: 'http://localhost:5173',
		});
		expect(mock.enableShutdownHooks).toHaveBeenCalledTimes(1);
		expect(mock.enableCors).toHaveBeenCalledWith(
			expect.objectContaining({
				origin: ['http://localhost:5173'],
				credentials: false,
			}),
		);
		expect(setupSwagger).toHaveBeenCalledWith(mock, 'development');
	});
	it('should prevent local policy from being used when production settings are undecided', () => {
		expect(() =>
			setupApplication(mock as unknown as INestApplication, {
				NODE_ENV: 'production',
				CORS_ORIGIN: 'http://localhost:5173',
			}),
		).toThrow('Production runtime policy');
		expect(mock.use).not.toHaveBeenCalled();
	});
	it('should use the validated origin when the operator configures another local frontend', () => {
		setupApplication(mock as unknown as INestApplication, {
			NODE_ENV: 'test',
			CORS_ORIGIN: 'http://localhost:5180',
		});
		expect(mock.enableCors).toHaveBeenCalledWith(
			expect.objectContaining({ origin: ['http://localhost:5180'] }),
		);
	});
});
