import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RefreshAuthGuard } from './refresh-auth.guard';

describe('RefreshAuthGuard', () => {
	let module: TestingModule;
	let guard: RefreshAuthGuard;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [RefreshAuthGuard],
		}).compile();
		guard = module.get(RefreshAuthGuard);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should accept refresh when Passport supplies a verified current token', () => {
		const principal = { sub: 'user', sid: 'session', tokenHash: 'hash' };
		expect(
			guard.handleRequest<unknown>(
				null,
				principal,
				null,
				{} as ExecutionContext,
			),
		).toBe(principal);
	});
	it('should reject refresh when no verified principal exists', () => {
		expect(() =>
			guard.handleRequest<unknown>(
				null,
				null,
				null,
				{} as ExecutionContext,
			),
		).toThrow(UnauthorizedException);
	});
	it('should preserve rejection when token reuse is detected', () => {
		const error = new UnauthorizedException('Reused');
		expect(() =>
			guard.handleRequest<unknown>(
				error,
				null,
				null,
				{} as ExecutionContext,
			),
		).toThrow(error);
	});
});
