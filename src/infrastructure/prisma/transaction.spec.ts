import {
	ConflictException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaService } from '@/infrastructure/prisma/prisma.service';
import {
	WRITE_CONFLICT_CODES,
	withTransaction,
	type TransactionPolicy,
} from './transaction';

const prismaWith = (transaction: jest.Mock) =>
	({ $transaction: transaction }) as unknown as PrismaService;
const work = () => Promise.resolve('committed');

const DOMAIN_TX: TransactionPolicy = {
	isolation: 'RepeatableRead',
	conflictCodes: WRITE_CONFLICT_CODES,
	conflictMessage: 'Concurrent change; reload and retry',
	unavailableMessage: 'Persistence unavailable',
};

describe('withTransaction', () => {
	it('should run the work once with the policy isolation level', async () => {
		const transaction = jest.fn().mockResolvedValue('committed');
		await expect(
			withTransaction(prismaWith(transaction), work, DOMAIN_TX),
		).resolves.toBe('committed');
		expect(transaction).toHaveBeenCalledWith(work, {
			isolationLevel: 'RepeatableRead',
		});
	});
	it('should not retry by default and map write conflicts to a safe 409', async () => {
		for (const code of ['P2002', 'P2034']) {
			const transaction = jest
				.fn()
				.mockRejectedValue({ code, meta: 'PRIVATE_DB_DETAIL' });
			const failure = withTransaction(
				prismaWith(transaction),
				work,
				DOMAIN_TX,
			);
			await expect(failure).rejects.toBeInstanceOf(ConflictException);
			await expect(failure).rejects.toThrow(
				'Concurrent change; reload and retry',
			);
			expect(transaction).toHaveBeenCalledTimes(1);
		}
	});
	it('should pass HTTP exceptions from the work through unchanged', async () => {
		const error = new NotFoundException('Group not found');
		const transaction = jest.fn().mockRejectedValue(error);
		await expect(
			withTransaction(prismaWith(transaction), work, DOMAIN_TX),
		).rejects.toBe(error);
	});
	it('should map any other failure to the policy 503 without leaking details', async () => {
		const transaction = jest
			.fn()
			.mockRejectedValue(new Error('PRIVATE_DB_DETAIL'));
		const failure = withTransaction(
			prismaWith(transaction),
			work,
			DOMAIN_TX,
		);
		await expect(failure).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		await expect(failure).rejects.toThrow('Persistence unavailable');
	});
	it('should only treat the listed codes as conflicts', async () => {
		const transaction = jest.fn().mockRejectedValue({ code: 'P2002' });
		await expect(
			withTransaction(prismaWith(transaction), work, {
				...DOMAIN_TX,
				conflictCodes: ['P2034'],
			}),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
});
