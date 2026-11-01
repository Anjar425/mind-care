import {
	ConflictException,
	HttpException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import type { PrismaService } from '../prisma/prisma.service';

export const GROUP_STATE_INCLUDE = {
	memberships: {
		include: {
			expert: {
				select: { userId: true, user: { select: { name: true } } },
			},
		},
	},
} as const satisfies Prisma.GroupInclude;

export async function groupTransaction<T>(
	prisma: PrismaService,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
	read = false,
): Promise<T> {
	try {
		return await prisma.$transaction(work, {
			isolationLevel: read ? 'RepeatableRead' : 'Serializable',
		});
	} catch (error: unknown) {
		if (error instanceof HttpException) throw error;
		const code =
			error && typeof error === 'object' && 'code' in error
				? error.code
				: undefined;
		if (code === 'P2002' || code === 'P2034')
			throw new ConflictException(
				'Concurrent group change; reload and retry',
			);
		throw new ServiceUnavailableException('Group persistence unavailable');
	}
}
export async function lockGroup(
	tx: Prisma.TransactionClient,
	userIds: string[],
	groupId?: number,
) {
	// Match credential/profile/preference writers: User rows first, then Group.
	for (const id of [...new Set(userIds)].sort())
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
	if (groupId !== undefined)
		await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;
}
