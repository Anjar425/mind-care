import type { PrismaService } from '../prisma/prisma.service';
import { screeningTransaction } from './screening-persistence';
import { screeningMocks } from '../../test/screening-mocks';
describe('Stateless screening transaction boundary', () => {
	it('should use RepeatableRead without creating a session for a guest', async () => {
		const f = screeningMocks();
		await screeningTransaction(
			f.prisma as unknown as PrismaService,
			undefined,
			() => Promise.resolve(),
		);
		expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
			isolationLevel: 'RepeatableRead',
		});
		expect(f.h.prisma.refreshToken.findFirst).not.toHaveBeenCalled();
	});
	it.each(['missing', 'revoked', 'role'])(
		'should reject a changed authenticated actor:%s',
		async (kind) => {
			const f = screeningMocks();
			if (kind === 'missing') f.h.users.delete(f.principal.sub);
			if (kind === 'revoked') f.h.sessions.clear();
			if (kind === 'role') f.h.users.set(f.principal.sub, 'EXPERT');
			await expect(
				screeningTransaction(
					f.prisma as unknown as PrismaService,
					f.principal,
					() => Promise.resolve(),
				),
			).rejects.toThrow();
		},
	);
	it('should deny management roles and redact unknown persistence failures', async () => {
		const f = screeningMocks();
		f.h.users.set(f.principal.sub, 'ADMIN');
		f.principal.role = 'ADMIN';
		await expect(
			screeningTransaction(
				f.prisma as unknown as PrismaService,
				f.principal,
				() => Promise.resolve(),
			),
		).rejects.toThrow();
		f.transaction.mockRejectedValueOnce(new Error('private query'));
		await expect(
			screeningTransaction(
				f.prisma as unknown as PrismaService,
				undefined,
				() => Promise.resolve(),
			),
		).rejects.toThrow('Screening unavailable');
	});
});
