import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
	WRITE_CONFLICT_CODES,
	withTransaction,
	type TransactionPolicy,
} from '../../infrastructure/prisma/transaction';

export const historyTx = (read = false): TransactionPolicy => ({
	isolation: read ? 'RepeatableRead' : 'Serializable',
	conflictCodes: WRITE_CONFLICT_CODES,
	conflictMessage: 'History changed; reload and retry',
	unavailableMessage: 'Private history storage unavailable',
});

// Re-checks inside the transaction that the caller still holds a personal account.
export async function historyTransaction<T>(
	prisma: PrismaService,
	userId: string,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
	read = false,
): Promise<T> {
	return withTransaction(
		prisma,
		async (tx) => {
			const user = await tx.user.findUnique({
				where: { id: userId },
				select: { role: true },
			});
			if (!user || !['USER', 'EXPERT'].includes(user.role))
				throw new ForbiddenException(
					'Personal history account required',
				);
			return work(tx);
		},
		historyTx(read),
	);
}
