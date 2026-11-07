import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
	GroupAction,
	Group,
	GroupInvitation,
	GroupLeadershipTransfer,
	Prisma,
} from '../prisma/generated/client';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { assertCredentialEligibility } from '../expert-credentials/credential-policy';
import {
	GROUP_STATE_INCLUDE,
	groupTransaction,
	lockGroup,
} from './group-persistence';
import {
	compareGroup,
	effectiveGrantStatus,
	GRANT_LIFETIME_MS,
	groupMetadata,
	groupStateHash,
	nextGroupUpdatedAt,
	privateGroup,
	requireActive,
	requireGroup,
	requireMember,
	requirePending,
} from './group-policy';
import type {
	CreateGroupDto,
	GroupPageQuery,
	GroupStateDto,
	InviteGroupDto,
	ReasonedGroupDto,
	TransferGroupDto,
	UpdateGroupDto,
} from './dto/group-requests.dto';

@Injectable()
export class GroupsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialEligibilityService,
	) {}

	private async actor(
		tx: Prisma.TransactionClient,
		userId: string,
		verified = false,
	) {
		const user = await tx.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				role: true,
				email_verified_at: true,
				expert: { select: { id: true } },
			},
		});
		if (
			!user ||
			user.role !== 'EXPERT' ||
			(verified && !user.email_verified_at)
		)
			throw new ForbiddenException(
				'Current verified expert account required',
			);
		return user;
	}
	private async contributor(
		tx: Prisma.TransactionClient,
		userId: string,
		now: Date,
	) {
		const expert = await this.credentials.find(userId, tx);
		assertCredentialEligibility(expert, now);
		return expert!;
	}
	private async group(tx: Prisma.TransactionClient, id: number) {
		return requireGroup(
			await tx.group.findUnique({
				where: { id },
				include: GROUP_STATE_INCLUDE,
			}),
		);
	}
	private async audit(
		tx: Prisma.TransactionClient,
		groupId: number,
		actorUserId: string,
		action: GroupAction,
		now: Date,
		extra: {
			affectedExpertId?: string;
			invitationId?: string;
			transferId?: string;
			reason?: string;
		} = {},
	) {
		await tx.groupAudit.create({
			data: { groupId, actorUserId, action, createdAt: now, ...extra },
		});
	}
	private async touch(tx: Prisma.TransactionClient, group: Group, now: Date) {
		await tx.group.update({
			where: { id: group.id },
			data: { updatedAt: nextGroupUpdatedAt(group, now) },
		});
	}
	private invitationView(grant: GroupInvitation, now = new Date()) {
		return {
			id: grant.id,
			groupId: grant.groupId,
			recipientUserId: grant.recipientUserId,
			status: effectiveGrantStatus(grant, now),
			createdAt: grant.createdAt,
			expiresAt: grant.expiresAt,
			decidedAt: grant.decidedAt,
		};
	}
	private transferView(grant: GroupLeadershipTransfer, now = new Date()) {
		return {
			id: grant.id,
			groupId: grant.groupId,
			proposedByExpertId: grant.proposedByExpertId,
			targetExpertId: grant.targetExpertId,
			status: effectiveGrantStatus(grant, now),
			createdAt: grant.createdAt,
			expiresAt: grant.expiresAt,
			decidedAt: grant.decidedAt,
		};
	}
	async create(userId: string, dto: CreateGroupDto) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId]);
			await this.actor(tx, userId, true);
			const now = new Date();
			const expert = await this.contributor(tx, userId, now);
			const group = await tx.group.create({
				data: {
					name: dto.name,
					description: dto.description,
					createdAt: now,
					updatedAt: now,
					memberships: {
						create: {
							expertId: expert.id,
							role: 'LEADER',
							status: 'ACTIVE',
							joinedAt: now,
						},
					},
				},
				include: GROUP_STATE_INCLUDE,
			});
			await this.audit(tx, group.id, userId, 'CREATED', now, {
				affectedExpertId: expert.id,
			});
			return privateGroup(group, expert.id);
		});
	}
	async mine(userId: string, q: GroupPageQuery) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await this.actor(tx, userId);
				if (!actor.expert)
					return {
						items: [],
						page: q.page,
						limit: q.limit,
						hasNext: false,
					};
				const rows = await tx.group.findMany({
					where: {
						memberships: {
							some: {
								expertId: actor.expert.id,
								status: 'ACTIVE',
							},
						},
					},
					orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
					include: GROUP_STATE_INCLUDE,
				});
				return {
					items: rows.slice(0, q.limit).map((g) => ({
						...groupMetadata(g),
						ownRole: requireMember(g, actor.expert!.id).role,
						stateHash: groupStateHash(g),
					})),
					page: q.page,
					limit: q.limit,
					hasNext: rows.length > q.limit,
				};
			},
			true,
		);
	}
	async detail(userId: string, groupId: number) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await this.actor(tx, userId);
				const group = await this.group(tx, groupId);
				const member = requireMember(group, actor.expert?.id);
				return privateGroup(group, member.expertId);
			},
			true,
		);
	}
	async update(userId: string, groupId: number, dto: UpdateGroupDto) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			const member = requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const now = new Date();
			await this.contributor(tx, userId, now);
			if (
				group.name !== dto.name ||
				group.description !== dto.description
			) {
				await tx.group.update({
					where: { id: groupId },
					data: {
						name: dto.name,
						description: dto.description,
						updatedAt: nextGroupUpdatedAt(group, now),
					},
				});
				await this.audit(tx, groupId, userId, 'METADATA_UPDATED', now);
			}
			return privateGroup(await this.group(tx, groupId), member.expertId);
		});
	}
	async invite(userId: string, groupId: number, dto: InviteGroupDto) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId, dto.recipientUserId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const now = new Date();
			await this.contributor(tx, userId, now);
			const recipient = await tx.user.findUnique({
				where: { id: dto.recipientUserId },
				select: { role: true, expert: { select: { id: true } } },
			});
			if (!recipient || recipient.role !== 'EXPERT')
				throw new NotFoundException(
					'Recipient expert account not found',
				);
			if (
				group.memberships.some(
					(m) =>
						m.expertId === recipient.expert?.id &&
						m.status === 'ACTIVE',
				)
			)
				throw new ConflictException('Recipient is already a member');
			await tx.groupInvitation.updateMany({
				where: {
					groupId,
					recipientUserId: dto.recipientUserId,
					status: 'PENDING',
					expiresAt: { lte: now },
				},
				data: { status: 'EXPIRED', decidedAt: now },
			});
			if (
				await tx.groupInvitation.findFirst({
					where: {
						groupId,
						recipientUserId: dto.recipientUserId,
						status: 'PENDING',
					},
				})
			)
				throw new ConflictException(
					'Recipient already has a pending invitation',
				);
			const grant = await tx.groupInvitation.create({
				data: {
					groupId,
					recipientUserId: dto.recipientUserId,
					inviterUserId: userId,
					createdAt: now,
					expiresAt: new Date(now.getTime() + GRANT_LIFETIME_MS),
				},
			});
			await this.audit(tx, groupId, userId, 'INVITED', now, {
				invitationId: grant.id,
			});
			return this.invitationView(grant, now);
		});
	}
	async invitations(userId: string, q: GroupPageQuery, groupId?: number) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await this.actor(tx, userId);
				if (groupId !== undefined)
					requireMember(
						await this.group(tx, groupId),
						actor.expert?.id,
						true,
					);
				const rows = await tx.groupInvitation.findMany({
					where:
						groupId === undefined
							? { recipientUserId: userId }
							: { groupId },
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				const now = new Date();
				return {
					items: rows
						.slice(0, q.limit)
						.map((g) => this.invitationView(g, now)),
					page: q.page,
					limit: q.limit,
					hasNext: rows.length > q.limit,
				};
			},
			true,
		);
	}
	async decideInvitation(
		userId: string,
		invitationId: string,
		accept: boolean,
	) {
		return groupTransaction(this.prisma, async (tx) => {
			const initial = await tx.groupInvitation.findUnique({
				where: { id: invitationId },
			});
			if (!initial || initial.recipientUserId !== userId)
				throw new NotFoundException('Invitation not found');
			await lockGroup(tx, [userId], initial.groupId);
			const actor = await this.actor(tx, userId, accept);
			const group = await this.group(tx, initial.groupId);
			const grant = await tx.groupInvitation.findUnique({
				where: { id: invitationId },
			});
			if (!grant || grant.recipientUserId !== userId)
				throw new NotFoundException('Invitation not found');
			requireActive(group);
			const now = new Date();
			requirePending(grant, now);
			if (accept) {
				const expert = await this.contributor(tx, userId, now);
				if (
					group.memberships.some(
						(m) =>
							m.expertId === expert.id && m.status === 'ACTIVE',
					)
				)
					throw new ConflictException('Already an active member');
				await tx.groupMembership.upsert({
					where: {
						groupId_expertId: {
							groupId: group.id,
							expertId: expert.id,
						},
					},
					create: {
						groupId: group.id,
						expertId: expert.id,
						role: 'MEMBER',
						status: 'ACTIVE',
						joinedAt: now,
					},
					update: {
						role: 'MEMBER',
						status: 'ACTIVE',
						joinedAt: now,
						leftAt: null,
					},
				});
				await this.touch(tx, group, now);
			}
			const decided = await tx.groupInvitation.update({
				where: { id: grant.id },
				data: {
					status: accept ? 'ACCEPTED' : 'DECLINED',
					decidedAt: now,
				},
			});
			await this.audit(
				tx,
				group.id,
				userId,
				accept ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
				now,
				{ invitationId: grant.id, affectedExpertId: actor.expert?.id },
			);
			return this.invitationView(decided, now);
		});
	}
	async revokeInvitation(
		userId: string,
		groupId: number,
		invitationId: string,
		dto: GroupStateDto,
	) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const grant = await tx.groupInvitation.findUnique({
				where: { id: invitationId },
			});
			if (!grant || grant.groupId !== groupId)
				throw new NotFoundException('Invitation not found');
			const now = new Date();
			requirePending(grant, now);
			const result = await tx.groupInvitation.update({
				where: { id: invitationId },
				data: { status: 'REVOKED', decidedAt: now },
			});
			await this.audit(tx, groupId, userId, 'INVITATION_REVOKED', now, {
				invitationId,
			});
			return this.invitationView(result, now);
		});
	}
	async leave(userId: string, groupId: number, dto: GroupStateDto) {
		return this.endMembership(userId, groupId, dto);
	}
	async remove(
		userId: string,
		groupId: number,
		expertId: string,
		dto: ReasonedGroupDto,
	) {
		return this.endMembership(userId, groupId, dto, expertId, dto.reason);
	}
	private async endMembership(
		userId: string,
		groupId: number,
		dto: GroupStateDto,
		targetId?: string,
		reason?: string,
	) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const actor = await this.actor(tx, userId, !!targetId);
			const group = await this.group(tx, groupId);
			const member = requireMember(group, actor.expert?.id, !!targetId);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const now = new Date();
			if (targetId) await this.contributor(tx, userId, now);
			const target = requireMember(group, targetId ?? member.expertId);
			if (target.role === 'LEADER')
				throw new ConflictException(
					'Leader must transfer leadership or archive the group',
				);
			await tx.groupMembership.update({
				where: { id: target.id },
				data: {
					status: targetId ? 'REMOVED' : 'LEFT',
					role: 'MEMBER',
					leftAt: now,
				},
			});
			await this.touch(tx, group, now);
			await this.audit(
				tx,
				groupId,
				userId,
				targetId ? 'MEMBER_REMOVED' : 'MEMBER_LEFT',
				now,
				{ affectedExpertId: target.expertId, reason },
			);
			return {
				...groupMetadata(await this.group(tx, groupId)),
				expertId: target.expertId,
				membershipStatus: targetId ? 'REMOVED' : 'LEFT',
			};
		});
	}
	async proposeTransfer(
		userId: string,
		groupId: number,
		dto: TransferGroupDto,
	) {
		return groupTransaction(this.prisma, async (tx) => {
			const target = await tx.expert.findUnique({
				where: { id: dto.targetExpertId },
				select: { userId: true },
			});
			if (!target) throw new NotFoundException('Target member not found');
			await lockGroup(tx, [userId, target.userId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			const leader = requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const member = requireMember(group, dto.targetExpertId);
			if (member.role === 'LEADER')
				throw new ConflictException('Choose a different member');
			const now = new Date();
			await this.contributor(tx, target.userId, now);
			await tx.groupLeadershipTransfer.updateMany({
				where: { groupId, status: 'PENDING', expiresAt: { lte: now } },
				data: { status: 'EXPIRED', decidedAt: now },
			});
			if (
				await tx.groupLeadershipTransfer.findFirst({
					where: { groupId, status: 'PENDING' },
				})
			)
				throw new ConflictException(
					'A leadership transfer is already pending',
				);
			const grant = await tx.groupLeadershipTransfer.create({
				data: {
					groupId,
					proposedByExpertId: leader.expertId,
					targetExpertId: member.expertId,
					expectedStateHash: groupStateHash(group),
					createdAt: now,
					expiresAt: new Date(now.getTime() + GRANT_LIFETIME_MS),
				},
			});
			await this.audit(tx, groupId, userId, 'TRANSFER_PROPOSED', now, {
				transferId: grant.id,
				affectedExpertId: member.expertId,
			});
			return this.transferView(grant, now);
		});
	}
	async transfers(userId: string, q: GroupPageQuery, groupId?: number) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await this.actor(tx, userId);
				if (groupId !== undefined)
					requireMember(
						await this.group(tx, groupId),
						actor.expert?.id,
						true,
					);
				if (!actor.expert)
					return {
						items: [],
						page: q.page,
						limit: q.limit,
						hasNext: false,
					};
				const rows = await tx.groupLeadershipTransfer.findMany({
					where:
						groupId === undefined
							? { targetExpertId: actor.expert.id }
							: { groupId },
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				const now = new Date();
				return {
					items: rows
						.slice(0, q.limit)
						.map((g) => this.transferView(g, now)),
					page: q.page,
					limit: q.limit,
					hasNext: rows.length > q.limit,
				};
			},
			true,
		);
	}
	async decideTransfer(userId: string, transferId: string, accept: boolean) {
		return groupTransaction(this.prisma, async (tx) => {
			const initial = await tx.groupLeadershipTransfer.findUnique({
				where: { id: transferId },
				include: {
					proposedBy: { select: { userId: true } },
					target: { select: { userId: true } },
				},
			});
			if (!initial || initial.target.userId !== userId)
				throw new NotFoundException('Leadership transfer not found');
			await lockGroup(
				tx,
				[userId, initial.proposedBy.userId],
				initial.groupId,
			);
			const actor = await this.actor(tx, userId, accept);
			const group = await this.group(tx, initial.groupId);
			const grant = await tx.groupLeadershipTransfer.findUnique({
				where: { id: transferId },
			});
			if (!grant || grant.targetExpertId !== actor.expert?.id)
				throw new NotFoundException('Leadership transfer not found');
			requireActive(group);
			const now = new Date();
			requirePending(grant, now);
			if (accept) {
				compareGroup(group, grant.expectedStateHash);
				await this.actor(tx, initial.proposedBy.userId, true);
				const source = requireMember(
					group,
					grant.proposedByExpertId,
					true,
				);
				const target = requireMember(group, grant.targetExpertId);
				await this.contributor(tx, userId, now);
				await tx.groupMembership.update({
					where: { id: source.id },
					data: { role: 'MEMBER' },
				});
				await tx.groupMembership.update({
					where: { id: target.id },
					data: { role: 'LEADER' },
				});
				await this.cancelInvitations(tx, group.id, userId, now);
				await this.touch(tx, group, now);
			}
			const result = await tx.groupLeadershipTransfer.update({
				where: { id: transferId },
				data: {
					status: accept ? 'ACCEPTED' : 'DECLINED',
					decidedAt: now,
				},
			});
			await this.audit(
				tx,
				group.id,
				userId,
				accept ? 'TRANSFER_ACCEPTED' : 'TRANSFER_DECLINED',
				now,
				{ transferId, affectedExpertId: grant.targetExpertId },
			);
			return this.transferView(result, now);
		});
	}
	async revokeTransfer(
		userId: string,
		groupId: number,
		transferId: string,
		dto: GroupStateDto,
	) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const grant = await tx.groupLeadershipTransfer.findUnique({
				where: { id: transferId },
			});
			if (!grant || grant.groupId !== groupId)
				throw new NotFoundException('Leadership transfer not found');
			const now = new Date();
			requirePending(grant, now);
			const result = await tx.groupLeadershipTransfer.update({
				where: { id: transferId },
				data: { status: 'REVOKED', decidedAt: now },
			});
			await this.audit(tx, groupId, userId, 'TRANSFER_REVOKED', now, {
				transferId,
			});
			return this.transferView(result, now);
		});
	}
	private async cancelInvitations(
		tx: Prisma.TransactionClient,
		groupId: number,
		userId: string,
		now: Date,
	) {
		const grants = await tx.groupInvitation.findMany({
			where: { groupId, status: 'PENDING' },
		});
		for (const grant of grants) {
			await tx.groupInvitation.update({
				where: { id: grant.id },
				data: {
					status:
						effectiveGrantStatus(grant, now) === 'EXPIRED'
							? 'EXPIRED'
							: 'REVOKED',
					decidedAt: now,
				},
			});
			await this.audit(tx, groupId, userId, 'INVITATION_REVOKED', now, {
				invitationId: grant.id,
			});
		}
	}
	async archive(userId: string, groupId: number, dto: ReasonedGroupDto) {
		return groupTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const actor = await this.actor(tx, userId, true);
			const group = await this.group(tx, groupId);
			const member = requireMember(group, actor.expert?.id, true);
			requireActive(group);
			compareGroup(group, dto.expectedStateHash);
			const now = new Date();
			await tx.group.update({
				where: { id: groupId },
				data: {
					archivedAt: now,
					updatedAt: nextGroupUpdatedAt(group, now),
				},
			});
			await this.cancelInvitations(tx, groupId, userId, now);
			const transfers = await tx.groupLeadershipTransfer.findMany({
				where: { groupId, status: 'PENDING' },
			});
			for (const grant of transfers) {
				await tx.groupLeadershipTransfer.update({
					where: { id: grant.id },
					data: {
						status:
							effectiveGrantStatus(grant, now) === 'EXPIRED'
								? 'EXPIRED'
								: 'REVOKED',
						decidedAt: now,
					},
				});
				await this.audit(tx, groupId, userId, 'TRANSFER_REVOKED', now, {
					transferId: grant.id,
				});
			}
			await this.audit(tx, groupId, userId, 'ARCHIVED', now, {
				reason: dto.reason,
			});
			return privateGroup(await this.group(tx, groupId), member.expertId);
		});
	}
	async audits(userId: string, groupId: number, q: GroupPageQuery) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await this.actor(tx, userId);
				requireMember(
					await this.group(tx, groupId),
					actor.expert?.id,
					true,
				);
				const rows = await tx.groupAudit.findMany({
					where: { groupId },
					select: {
						id: true,
						action: true,
						actorUserId: true,
						affectedExpertId: true,
						invitationId: true,
						transferId: true,
						reason: true,
						createdAt: true,
					},
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				return {
					items: rows.slice(0, q.limit),
					page: q.page,
					limit: q.limit,
					hasNext: rows.length > q.limit,
				};
			},
			true,
		);
	}
}
