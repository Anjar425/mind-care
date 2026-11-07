import {
	ConflictException,
	ForbiddenException,
	HttpException,
	ServiceUnavailableException,
	UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessPrincipal } from '../auth/session.types';
export async function screeningTransaction<T>(
	prisma: PrismaService,
	principal: AccessPrincipal | undefined,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	try {
		return await prisma.$transaction(
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
			{ isolationLevel: 'RepeatableRead' },
		);
	} catch (error: unknown) {
		if (error instanceof HttpException) throw error;
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'P2034'
		)
			throw new ConflictException(
				'Screening source changed; retry explicitly',
			);
		throw new ServiceUnavailableException('Screening unavailable');
	}
}
