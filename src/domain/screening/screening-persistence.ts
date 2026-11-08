import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
	withTransaction,
	type TransactionPolicy,
} from '../../infrastructure/prisma/transaction';
import type { AccessPrincipal } from '../identity/identity.types';

// Only serialization failures map to 409 here; every other database error is a 503.
export const SCREENING_TX: TransactionPolicy = {
	isolation: 'RepeatableRead',
	conflictCodes: ['P2034'],
	conflictMessage: 'Screening source changed; retry explicitly',
	unavailableMessage: 'Screening unavailable',
};

// Re-validates an authenticated caller (user, role, live session) inside the snapshot.
export async function screeningTransaction<T>(
	prisma: PrismaService,
	principal: AccessPrincipal | undefined,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	return withTransaction(
		prisma,
		async (tx) => {
			if (principal) {
				const user = await tx.user.findUnique({
					where: { id: principal.sub },
					select: { role: true },
				});
				const session = await tx.refreshToken.findFirst({
					where: {
						id: principal.sid,
						userId: principal.sub,
						expiresAt: { gt: new Date() },
					},
					select: { id: true },
				});
				if (!user || !session || user.role !== principal.role)
					throw new UnauthorizedException();
				if (!['USER', 'EXPERT'].includes(user.role))
					throw new ForbiddenException();
			}
			return work(tx);
		},
		SCREENING_TX,
	);
}
