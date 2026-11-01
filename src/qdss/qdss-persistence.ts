import {
	ConflictException,
	ForbiddenException,
	HttpException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import type { PrismaService } from '../prisma/prisma.service';
import { lockGroup } from '../groups/group-persistence';
export async function qdssTransaction<T>(
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
				'Concurrent QDSS change; reload and retry',
			);
		throw new ServiceUnavailableException('QDSS persistence unavailable');
	}
}
export const configurationId = (groupId: number | null) =>
	groupId === null ? 'global' : `group:${groupId}`;
export async function qdssAccess(
	tx: Prisma.TransactionClient,
	userId: string,
	groupId: number | null,
	write = false,
) {
	const actor = await tx.user.findUnique({
		where: { id: userId },
		select: { role: true, expert: { select: { id: true } } },
	});
	if (!actor) throw new ForbiddenException('Current account required');
	if (groupId === null) {
		if (actor.role === 'ADMIN') return;
		if (write || actor.role !== 'EXPERT' || !actor.expert)
			throw new ForbiddenException(
				'Global calibration requires ADMIN or current group membership',
			);
		const membership = await tx.groupMembership.findFirst({
			where: {
				expertId: actor.expert.id,
				status: 'ACTIVE',
				group: { archivedAt: null },
			},
			select: { id: true },
		});
		if (!membership)
			throw new ForbiddenException('Active group membership required');
		return;
	}
	if (actor.role !== 'EXPERT' || !actor.expert)
		throw new ForbiddenException('Current expert required');
	const group = await tx.group.findUnique({
		where: { id: groupId },
		select: { archivedAt: true },
	});
	if (!group) throw new NotFoundException('Group not found');
	const member = await tx.groupMembership.findUnique({
		where: { groupId_expertId: { groupId, expertId: actor.expert.id } },
	});
	if (
		!member ||
		member.status !== 'ACTIVE' ||
		(write && member.role !== 'LEADER')
	)
		throw new ForbiddenException(
			write
				? 'Current group leader required'
				: 'Active group membership required',
		);
	if (write && group.archivedAt)
		throw new ConflictException('Group is archived');
	if (write) {
		const leaders = await tx.groupMembership.findMany({
			where: { groupId, status: 'ACTIVE', role: 'LEADER' },
			select: { id: true },
		});
		if (leaders.length !== 1)
			throw new ConflictException('Group leadership requires review');
	}
}
export async function lockConfiguration(
	tx: Prisma.TransactionClient,
	userIds: string[],
	groupId: number | null,
) {
	await lockGroup(tx, userIds, groupId ?? undefined);
	const key = configurationId(groupId);
	await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
