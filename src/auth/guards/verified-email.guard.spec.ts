import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { VerifiedEmailGuard } from './verified-email.guard';
describe('VerifiedEmailGuard', () => {
	let module: TestingModule;
	let guard: VerifiedEmailGuard;
	const findUnique = jest.fn();
	const context = {
		switchToHttp: () => ({
			getRequest: () => ({ user: { sub: 'owner' } }),
		}),
	} as unknown as ExecutionContext;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [
				VerifiedEmailGuard,
				{ provide: PrismaService, useValue: { user: { findUnique } } },
			],
		}).compile();
		guard = module.get(VerifiedEmailGuard);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(guard).toBeDefined());
	it('should use current database verification rather than an access-token claim', async () => {
		findUnique.mockResolvedValue({
			role: 'EXPERT',
			email_verified_at: new Date(),
		});
		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(findUnique).toHaveBeenCalledWith({
			where: { id: 'owner' },
			select: { role: true, email_verified_at: true },
		});
	});
	it.each([
		null,
		{ role: 'USER', email_verified_at: new Date() },
		{ role: 'EXPERT', email_verified_at: null },
	])(
		'should deny missing, wrong-role or unverified current state %p',
		async (row) => {
			findUnique.mockResolvedValue(row);
			await expect(guard.canActivate(context)).rejects.toThrow('Verify');
		},
	);
});
