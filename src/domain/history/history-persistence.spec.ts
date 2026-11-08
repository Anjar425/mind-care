import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { historyMocks, historyOwner } from '../../../test/history-mocks';
import { historyTransaction } from './history-persistence';
describe('History transaction and safe failures', () => {
	it.each(['P2002', 'P2034'])(
		'should map concurrency code%s without raw database details',
		async (code) => {
			const f = historyMocks();
			f.prisma.$transaction.mockRejectedValueOnce(
				Object.assign(new Error('private raw query'), { code }),
			);
			await expect(
				historyTransaction(
					f.prisma as unknown as PrismaService,
					historyOwner,
					() => Promise.resolve(),
				),
			).rejects.toThrow('History changed');
		},
	);
	it('should preserve safe application errors and redact unknown failures', async () => {
		const f = historyMocks();
		await expect(
			historyTransaction(
				f.prisma as unknown as PrismaService,
				historyOwner,
				() => Promise.reject(new ConflictException('safe')),
			),
		).rejects.toThrow('safe');
		await expect(
			historyTransaction(
				f.prisma as unknown as PrismaService,
				historyOwner,
				() => Promise.reject(new Error('never echo answers')),
			),
		).rejects.toThrow('Private history storage unavailable');
	});
	it('should use repeatable reads and serializable writes with a current actor check', async () => {
		const f = historyMocks();
		await historyTransaction(
			f.prisma as unknown as PrismaService,
			historyOwner,
			() => Promise.resolve(),
			true,
		);
		expect(f.prisma.$transaction).toHaveBeenLastCalledWith(
			expect.any(Function),
			{ isolationLevel: 'RepeatableRead' },
		);
		await historyTransaction(
			f.prisma as unknown as PrismaService,
			historyOwner,
			() => Promise.resolve(),
		);
		expect(f.prisma.$transaction).toHaveBeenLastCalledWith(
			expect.any(Function),
			{ isolationLevel: 'Serializable' },
		);
	});
});
