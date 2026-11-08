import type { Prisma } from '../../infrastructure/prisma/generated/client';
import {
	WRITE_CONFLICT_CODES,
	type TransactionPolicy,
} from '../../infrastructure/prisma/transaction';

export const GROUP_STATE_INCLUDE = {
	memberships: {
		include: {
			expert: {
				select: { userId: true, user: { select: { name: true } } },
			},
		},
	},
} as const satisfies Prisma.GroupInclude;

export const groupTx = (read = false): TransactionPolicy => ({
	isolation: read ? 'RepeatableRead' : 'Serializable',
	conflictCodes: WRITE_CONFLICT_CODES,
	conflictMessage: 'Concurrent group change; reload and retry',
	unavailableMessage: 'Group persistence unavailable',
});
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
