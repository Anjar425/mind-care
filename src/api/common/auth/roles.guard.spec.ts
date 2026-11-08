import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';
describe('RolesGuard', () => {
	let module: TestingModule;
	let guard: RolesGuard;
	const reflector = { getAllAndOverride: jest.fn() };
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [
				RolesGuard,
				{ provide: Reflector, useValue: reflector },
			],
		}).compile();
		guard = module.get(RolesGuard);
		reflector.getAllAndOverride.mockReturnValue(['EXPERT']);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	const context = (role?: string) =>
		({
			getHandler: () => () => undefined,
			getClass: () => class Handler {},
			switchToHttp: () => ({
				getRequest: () => ({ user: role ? { role } : undefined }),
			}),
		}) as unknown as ExecutionContext;
	it('should be defined', () => expect(guard).toBeDefined());
	it('should permit an explicitly allowed live principal role', () =>
		expect(guard.canActivate(context('EXPERT'))).toBe(true));
	it.each(['USER', 'ADMIN', undefined])(
		'should reject a disallowed or absent principal %s',
		(role) =>
			expect(() => guard.canActivate(context(role))).toThrow(
				'not permitted',
			),
	);
	it('should fail closed when role metadata is missing', () => {
		reflector.getAllAndOverride.mockReturnValue(undefined);
		expect(() => guard.canActivate(context('EXPERT'))).toThrow();
	});
});
