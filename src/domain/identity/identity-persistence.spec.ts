import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { withTransaction } from '../../infrastructure/prisma/transaction';
import { IDENTITY_TX } from './identity-persistence';

const prismaWith = (transaction: jest.Mock) =>
	({ $transaction: transaction }) as unknown as PrismaService;
const work = () => Promise.resolve('committed');

describe('Identity transaction policy', () => {
	it('should retry serialization conflicts when the database returns P2034', async () => {
		const transaction = jest
			.fn()
			.mockRejectedValueOnce({ code: 'P2034' })
			.mockResolvedValueOnce('committed');
		expect(
			await withTransaction(prismaWith(transaction), work, IDENTITY_TX),
		).toBe('committed');
		expect(transaction).toHaveBeenCalledTimes(2);
		expect(transaction).toHaveBeenCalledWith(work, {
			isolationLevel: 'Serializable',
		});
	});
	it('should return a safe conflict when serialization retries are exhausted', async () => {
		const transaction = jest
			.fn()
			.mockRejectedValue({ code: 'P2034', private: 'PRIVATE_DB_DETAIL' });
		await expect(
			withTransaction(prismaWith(transaction), work, IDENTITY_TX),
		).rejects.toThrow('Account changed concurrently; retry the request');
		expect(transaction).toHaveBeenCalledTimes(3);
	});
	it('should propagate an error when it is not a serialization conflict', async () => {
		for (const error of [new Error('Unavailable'), { code: 'P2002' }]) {
			const transaction = jest.fn().mockRejectedValue(error);
			await expect(
				withTransaction(prismaWith(transaction), work, IDENTITY_TX),
			).rejects.toBe(error);
			expect(transaction).toHaveBeenCalledTimes(1);
		}
	});
});
