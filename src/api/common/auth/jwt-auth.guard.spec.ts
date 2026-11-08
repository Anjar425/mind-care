import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
	let module: TestingModule;
	let guard: JwtAuthGuard;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [JwtAuthGuard],
		}).compile();
		guard = module.get(JwtAuthGuard);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should accept the principal when Passport has verified the active session', () => {
		const principal = { sub: 'user', sid: 'session' };
		expect(
			guard.handleRequest<unknown>(
				null,
				principal,
				null,
				{} as ExecutionContext,
			),
		).toBe(principal);
	});
	it('should reject access when Passport supplies no principal', () => {
		expect(() =>
			guard.handleRequest<unknown>(
				null,
				null,
				null,
				{} as ExecutionContext,
			),
		).toThrow(UnauthorizedException);
	});
	it('should preserve rejection when session validation reports an error', () => {
		const error = new UnauthorizedException('Revoked');
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
