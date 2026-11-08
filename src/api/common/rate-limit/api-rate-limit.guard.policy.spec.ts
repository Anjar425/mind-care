import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import {
	runtimeConfigProvider,
	runtimeConfigMock,
	syntheticConfig,
} from '../../../../test/runtime-config.mock';
import { ApiRateLimitGuard } from './api-rate-limit.guard';
import { RateLimit, type RateLimitAction } from './rate-limit.decorator';

function handler(action?: RateLimitAction) {
	const fn = () => undefined;
	if (action) RateLimit(action)(fn, 'handle', { value: fn });
	return fn;
}

function context(
	action: RateLimitAction | undefined,
	body: unknown,
	ip = '198.51.100.1',
): ExecutionContext {
	const fn = handler(action);
	return {
		getHandler: () => fn,
		switchToHttp: () => ({
			getRequest: () => ({ ip, body, socket: {} }),
			getResponse: () => ({ setHeader: jest.fn() }),
		}),
	} as unknown as ExecutionContext;
}

describe('ApiRateLimitGuard policy', () => {
	let module: TestingModule;
	let guard: ApiRateLimitGuard;
	let storage: ThrottlerStorageService;
	const increment = jest.fn();

	beforeEach(async () => {
		runtimeConfigMock.get.mockImplementation((key) => syntheticConfig[key]);
		storage = new ThrottlerStorageService();
		increment.mockImplementation(
			(...args: Parameters<ThrottlerStorage['increment']>) =>
				storage.increment(...args),
		);
		module = await Test.createTestingModule({
			providers: [
				runtimeConfigProvider,
				Reflector,
				ApiRateLimitGuard,
				{ provide: ThrottlerStorage, useValue: { increment } },
			],
		}).compile();
		guard = module.get(ApiRateLimitGuard);
		jest.spyOn(Logger.prototype, 'warn').mockImplementation(
			() => undefined,
		);
	});
	afterEach(async () => {
		storage.onApplicationShutdown();
		await module.close();
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	it('should limit one email across many IPs and keep other emails unaffected', async () => {
		const limit = syntheticConfig.RATE_LIMIT_LOGIN_ACCOUNT;
		for (let i = 0; i < limit; i++)
			await guard.canActivate(
				context(
					'login',
					{ email: 'Victim@Example.test' },
					`203.0.113.${i}`,
				),
			);
		await expect(
			guard.canActivate(
				context(
					'login',
					{ email: ' victim@example.test ' },
					'203.0.113.200',
				),
			),
		).rejects.toThrow('Too many requests');
		await expect(
			guard.canActivate(
				context(
					'login',
					{ email: 'other@example.test' },
					'203.0.113.201',
				),
			),
		).resolves.toBe(true);
	});

	it('should apply the email limit to forgot-password and resend-verification separately', async () => {
		const limit = syntheticConfig.RATE_LIMIT_EMAIL_ACCOUNT;
		for (let i = 0; i < limit; i++)
			await guard.canActivate(
				context('forgot', { email: 'a@example.test' }, `192.0.2.${i}`),
			);
		await expect(
			guard.canActivate(
				context('forgot', { email: 'a@example.test' }, '192.0.2.100'),
			),
		).rejects.toThrow('Too many requests');
		await expect(
			guard.canActivate(
				context(
					'verification',
					{ email: 'a@example.test' },
					'192.0.2.101',
				),
			),
		).resolves.toBe(true);
	});

	it('should skip the account counter when no usable email is submitted', async () => {
		for (const body of [undefined, {}, { email: 42 }, { email: '   ' }])
			await guard.canActivate(context('login', body));
		const names = (
			increment.mock.calls as Parameters<ThrottlerStorage['increment']>[]
		).map((call) => call[4]);
		expect(names).not.toContain('login-account');
	});

	it('should let general traffic and screenings through when the store is unavailable', async () => {
		increment.mockRejectedValue(new Error('connection refused'));
		await expect(guard.canActivate(context(undefined, {}))).resolves.toBe(
			true,
		);
		await expect(
			guard.canActivate(context('screening-qdss', {})),
		).resolves.toBe(true);
	});

	it.each([
		'login',
		'register',
		'forgot',
		'verification',
		'refresh',
		'credential-upload',
	] as const)(
		'should refuse %s with 503 when the store is unavailable',
		async (action) => {
			increment.mockRejectedValue(new Error('connection refused'));
			await expect(
				guard.canActivate(context(action, { email: 'a@example.test' })),
			).rejects.toMatchObject({ status: 503 });
		},
	);
});
