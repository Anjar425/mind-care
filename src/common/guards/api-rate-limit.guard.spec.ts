import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { ApiRateLimitGuard } from './api-rate-limit.guard';
import {
	runtimeConfigProvider,
	runtimeConfigMock,
	syntheticConfig,
} from '../../../test/runtime-config.mock';

describe('ApiRateLimitGuard', () => {
	let module: TestingModule;
	let guard: ApiRateLimitGuard;
	let storage: ThrottlerStorageService;
	const header = jest.fn();
	function context(
		path: string,
		ip = '127.0.0.1',
		method = 'POST',
	): ExecutionContext {
		return {
			switchToHttp: () => ({
				getRequest: () => ({
					method,
					route: { path },
					socket: { remoteAddress: ip },
				}),
				getResponse: () => ({ setHeader: header }),
			}),
		} as unknown as ExecutionContext;
	}
	beforeEach(async () => {
		runtimeConfigMock.get.mockImplementation((key) => syntheticConfig[key]);
		jest.useFakeTimers();
		storage = new ThrottlerStorageService();
		module = await Test.createTestingModule({
			providers: [
				runtimeConfigProvider,
				ApiRateLimitGuard,
				{
					provide: ThrottlerStorage,
					useValue: {
						increment: jest.fn(
							(
								...args: Parameters<
									ThrottlerStorage['increment']
								>
							) => storage.increment(...args),
						),
					},
				},
			],
		}).compile();
		guard = module.get(ApiRateLimitGuard);
	});
	afterEach(async () => {
		storage.onApplicationShutdown();
		await module.close();
		jest.useRealTimers();
		jest.clearAllMocks();
	});
	it('should share login quota when the caller switches account endpoint', async () => {
		for (const path of [
			'/auth/login',
			'/auth/expert/login',
			'/auth/admin/login',
			'/auth/login',
			'/auth/admin/login',
		])
			await guard.canActivate(context(path));
		await expect(
			guard.canActivate(context('/auth/expert/login')),
		).rejects.toThrow('Too many requests');
		expect(header).toHaveBeenCalledWith('Retry-After', 60);
	});
	it('should share registration quota when the caller switches account type', async () => {
		await guard.canActivate(context('/auth/user/register'));
		await guard.canActivate(context('/auth/expert/register'));
		await guard.canActivate(context('/auth/user/register'));
		await expect(
			guard.canActivate(context('/auth/expert/register')),
		).rejects.toThrow('Too many requests');
	});
	it.each([
		['/auth/forgot-password', 3],
		['/auth/send-verification', 3],
		['/auth/refresh', 30],
	] as const)(
		'should enforce %s quota when %i requests have been consumed',
		async (path, limit) => {
			for (let i = 0; i < limit; i++)
				await guard.canActivate(context(path));
			await expect(guard.canActivate(context(path))).rejects.toThrow(
				'Too many requests',
			);
		},
	);
	it('should share aggregate quota when callers change paths and methods', async () => {
		for (let i = 0; i < 120; i++)
			await guard.canActivate(
				context(`/different/${i}`, '127.0.0.1', i % 2 ? 'GET' : 'POST'),
			);
		await expect(
			guard.canActivate(context('/health/live', '127.0.0.1', 'GET')),
		).rejects.toThrow('Too many requests');
	});
	it('should keep IPs separate when another peer consumes the quota', async () => {
		for (let i = 0; i < 5; i++)
			await guard.canActivate(context('/auth/login'));
		await expect(
			guard.canActivate(context('/auth/login', '127.0.0.2')),
		).resolves.toBe(true);
	});
	it('should allow requests again when the block and hit window expire', async () => {
		for (let i = 0; i < 5; i++)
			await guard.canActivate(context('/auth/login'));
		await expect(
			guard.canActivate(context('/auth/login')),
		).rejects.toThrow();
		await jest.advanceTimersByTimeAsync(60001);
		await expect(guard.canActivate(context('/auth/login'))).resolves.toBe(
			true,
		);
	});
	it('should fail closed when storage is unavailable', async () => {
		jest.spyOn(storage, 'increment').mockRejectedValue(
			new Error('synthetic-store-failure'),
		);
		await expect(guard.canActivate(context('/auth/login'))).rejects.toThrow(
			'synthetic-store-failure',
		);
	});
	it('should use configured quotas and windows when local settings change', async () => {
		const settings = {
			...syntheticConfig,
			RATE_LIMIT_LOGIN: 2,
			RATE_LIMIT_WINDOW_MS: 1000,
		};
		runtimeConfigMock.get.mockImplementation((key) => settings[key]);
		await guard.canActivate(context('/auth/login'));
		await guard.canActivate(context('/auth/expert/login'));
		await expect(
			guard.canActivate(context('/auth/admin/login')),
		).rejects.toThrow('Too many requests');
		await jest.advanceTimersByTimeAsync(1001);
		await expect(guard.canActivate(context('/auth/login'))).resolves.toBe(
			true,
		);
	});
});
