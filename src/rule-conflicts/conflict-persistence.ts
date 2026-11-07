import {
	ConflictException,
	ForbiddenException,
	HttpException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import type { PrismaService } from '../prisma/prisma.service';

export async function conflictTransaction<T>(
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
				'Concurrent conflict review change; reload and retry',
			);
		throw new ServiceUnavailableException(
			'Conflict workflow persistence unavailable',
		);
	}
}
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
