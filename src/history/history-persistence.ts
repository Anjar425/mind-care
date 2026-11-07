import {
	ConflictException,
	ForbiddenException,
	HttpException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import type { PrismaService } from '../prisma/prisma.service';

export async function historyTransaction<T>(
	prisma: PrismaService,
	userId: string,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
	read = false,
): Promise<T> {
	try {
		return await prisma.$transaction(
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
			{ isolationLevel: read ? 'RepeatableRead' : 'Serializable' },
		);
	} catch (error: unknown) {
		if (error instanceof HttpException) throw error;
		const code =
			error && typeof error === 'object' && 'code' in error
				? error.code
				: undefined;
		if (code === 'P2002' || code === 'P2034')
			throw new ConflictException('History changed; reload and retry');
		throw new ServiceUnavailableException(
			'Private history storage unavailable',
		);
	}
}
