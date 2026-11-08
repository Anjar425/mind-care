import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../infrastructure/prisma/generated/client';
import {
	WRITE_CONFLICT_CODES,
	type TransactionPolicy,
} from '../../../infrastructure/prisma/transaction';

export const ruleConflictTx = (read = false): TransactionPolicy => ({
	isolation: read ? 'RepeatableRead' : 'Serializable',
	conflictCodes: WRITE_CONFLICT_CODES,
	conflictMessage: 'Concurrent conflict review change; reload and retry',
	unavailableMessage: 'Conflict workflow persistence unavailable',
});
export async function conflictActor(
	tx: Prisma.TransactionClient,
	userId: string,
	role: 'EXPERT' | 'ADMIN' = 'EXPERT',
) {
	const actor = await tx.user.findUnique({
		where: { id: userId },
		select: { role: true, expert: { select: { id: true } } },
	});
	if (!actor || actor.role !== role)
		throw new ForbiddenException(`Current ${role} account required`);
	return { userId, expertId: actor.expert?.id ?? null };
}
export async function conflictScope(
	tx: Prisma.TransactionClient,
	userId: string,
	groupId: number,
) {
	const actor = await conflictActor(tx, userId);
	const group = await tx.group.findUnique({
		where: { id: groupId },
		select: { id: true, archivedAt: true },
	});
	if (!group) throw new NotFoundException('Group not found');
	const membership = actor.expertId
		? await tx.groupMembership.findUnique({
				where: {
					groupId_expertId: { groupId, expertId: actor.expertId },
				},
				select: {
					id: true,
					expertId: true,
					status: true,
					role: true,
					joinedAt: true,
				},
			})
		: null;
	return { ...actor, group, membership };
}
export function requireConflictMember(
	scope: Awaited<ReturnType<typeof conflictScope>>,
	write = false,
) {
	if (!scope.membership || scope.membership.status !== 'ACTIVE')
		throw new ForbiddenException('Active group membership required');
	if (write && scope.group.archivedAt)
		throw new ConflictException('Group is archived');
}
