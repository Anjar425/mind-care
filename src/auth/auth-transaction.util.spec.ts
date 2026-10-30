import type { PrismaService } from '@/prisma/prisma.service';
import { authTransaction } from './auth-transaction.util';

describe('Auth transaction retry', () => {
	afterEach(() => jest.clearAllMocks());
	it('should retry serialization conflicts when the database returns P2034', async () => {
		const transaction = jest
			.fn()
			.mockRejectedValueOnce({ code: 'P2034' })
			.mockResolvedValueOnce('committed');
		const prisma = {
			$transaction: transaction,
		} as unknown as PrismaService;
		expect(
			await authTransaction(prisma, () => Promise.resolve('committed')),
		).toBe('committed');
		expect(transaction).toHaveBeenCalledTimes(2);
	});
	it('should return a safe conflict when serialization retries are exhausted', async () => {
		const transaction = jest
			.fn()
			.mockRejectedValue({ code: 'P2034', private: 'PRIVATE_DB_DETAIL' });
		await expect(
			authTransaction(
				{ $transaction: transaction } as unknown as PrismaService,
				() => Promise.resolve(undefined),
			),
		).rejects.toThrow('Account changed concurrently; retry the request');
		expect(transaction).toHaveBeenCalledTimes(3);
	});
	it('should propagate an error when it is not a serialization conflict', async () => {
		const error = new Error('Unavailable');
		const transaction = jest.fn().mockRejectedValue(error);
		await expect(
			authTransaction(
				{ $transaction: transaction } as unknown as PrismaService,
				() => Promise.resolve(undefined),
			),
		).rejects.toBe(error);
		expect(transaction).toHaveBeenCalledTimes(1);
	});
});
