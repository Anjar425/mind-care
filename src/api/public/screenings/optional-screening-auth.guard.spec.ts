import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { OptionalScreeningAuthGuard } from './optional-screening-auth.guard';
import { screeningMocks } from '../../../../test/screening-mocks';
describe('Optional supplied-token validation without guest downgrade', () => {
	afterEach(() => jest.restoreAllMocks());
	const context = (req: unknown) =>
		({
			switchToHttp: () => ({ getRequest: () => req }),
		}) as unknown as ExecutionContext;
	it('should allow an anonymous request and clear stale request-local identity', async () => {
		const req = { headers: {}, user: screeningMocks().principal };
		const superGuard = jest.spyOn(JwtAuthGuard.prototype, 'canActivate');
		expect(
			await new OptionalScreeningAuthGuard().canActivate(context(req)),
		).toBe(true);
		expect(req).not.toHaveProperty('user');
		expect(superGuard).not.toHaveBeenCalled();
	});
	it.each(['', 'Basic secret', 'Bearer', 'Bearer a b', 'Bearer a,b'])(
		'should reject malformed supplied authorization:%s',
		async (authorization) => {
			await expect(
				new OptionalScreeningAuthGuard().canActivate(
					context({ headers: { authorization } }),
				),
			).rejects.toThrow();
		},
	);
	it('should reject duplicate authorization headers', async () => {
		await expect(
			new OptionalScreeningAuthGuard().canActivate(
				context({
					headers: { authorization: 'Bearer one' },
					rawHeaders: [
						'Authorization',
						'Bearer one',
						'authorization',
						'Bearer two',
					],
				}),
			),
		).rejects.toThrow();
	});
	it('should require the normal current-session Passport result whenever a header is supplied', async () => {
		const req = {
			headers: { authorization: 'Bearer synthetic' },
			user: screeningMocks().principal,
		};
		jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockResolvedValue(
			true,
		);
		expect(
			await new OptionalScreeningAuthGuard().canActivate(context(req)),
		).toBe(true);
		req.user.role = 'ADMIN';
		await expect(
			new OptionalScreeningAuthGuard().canActivate(context(req)),
		).rejects.toThrow();
	});
	it('should propagate a revoked/invalid token instead of accepting a guest', async () => {
		jest.spyOn(JwtAuthGuard.prototype, 'canActivate').mockRejectedValue(
			new UnauthorizedException(),
		);
		await expect(
			new OptionalScreeningAuthGuard().canActivate(
				context({ headers: { authorization: 'Bearer invalid' } }),
			),
		).rejects.toThrow();
	});
});
