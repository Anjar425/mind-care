import { createHash } from 'node:crypto';
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import type {
	Group,
	GroupMembership,
	GroupGrantStatus,
} from '../prisma/generated/client';

export const GRANT_LIFETIME_MS = 7 * 86_400_000;
export const MIN_VALID_EXPERTS = 4;
export function nextGroupUpdatedAt(
	group: { updatedAt: Date },
	now: Date,
): Date {
	// Keep comparison hashes distinct even for multiple mutations in one millisecond.
	return new Date(Math.max(now.getTime(), group.updatedAt.getTime() + 1));
}
export interface GroupState extends Group {
	memberships: (GroupMembership & {
		expert: { userId: string; user: { name: string } };
	})[];
}
export function groupStateHash(group: GroupState): string {
	return createHash('sha256')
		.update(
			JSON.stringify([
				group.id,
				group.name,
				group.description,
				group.createdAt.toISOString(),
				group.updatedAt.toISOString(),
				group.archivedAt?.toISOString() ?? null,
				group.memberships
					.filter((m) => m.status === 'ACTIVE')
					.map((m) => [m.expertId, m.role, m.joinedAt.toISOString()])
					.sort((a, b) => a[0].localeCompare(b[0])),
			]),
		)
		.digest('hex');
}
export function requireGroup(group: GroupState | null): GroupState {
	if (!group) throw new NotFoundException('Group not found');
	return group;
}
export function requireActive(group: GroupState) {
	if (group.archivedAt) throw new ConflictException('Group is archived');
}
export function requireMember(
	group: GroupState,
	expertId?: string | null,
	leader = false,
) {
	const member = group.memberships.find(
		(m) => m.expertId === expertId && m.status === 'ACTIVE',
	);
	if (!member || (leader && member.role !== 'LEADER'))
		throw new ForbiddenException(
			leader
				? 'Current group leader required'
				: 'Active group membership required',
		);
	return member;
}
export function compareGroup(group: GroupState, expected: string) {
	if (groupStateHash(group) !== expected)
		throw new ConflictException('Group changed; reload before submitting');
}
export function effectiveGrantStatus(
	grant: { status: GroupGrantStatus; expiresAt: Date },
	now = new Date(),
): GroupGrantStatus {
	return grant.status === 'PENDING' && grant.expiresAt <= now
		? 'EXPIRED'
		: grant.status;
}
export function requirePending(
	grant: { status: GroupGrantStatus; expiresAt: Date },
	now = new Date(),
) {
	if (effectiveGrantStatus(grant, now) !== 'PENDING')
		throw new ConflictException('Grant is no longer pending');
}
export function groupMetadata(group: Group) {
	return {
		id: group.id,
		name: group.name,
		description: group.description,
		createdAt: group.createdAt,
		updatedAt: group.updatedAt,
		archivedAt: group.archivedAt,
	};
}
export function privateGroup(group: GroupState, expertId: string) {
	const member = requireMember(group, expertId);
	return {
		...groupMetadata(group),
		stateHash: groupStateHash(group),
		ownRole: member.role,
		members: group.memberships
			.filter((m) => m.status === 'ACTIVE')
			.sort((a, b) => a.expertId.localeCompare(b.expertId))
			.map((m) => ({
				expertId: m.expertId,
				name: m.expert.user.name,
				role: m.role,
				isSelf: m.expertId === expertId,
			})),
	};
}
