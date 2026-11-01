import {
	ConflictException,
	HttpException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { lockGroup } from '../groups/group-persistence';
import {
	conflictActor,
	conflictScope,
	conflictTransaction,
	requireConflictMember,
} from './conflict-persistence';
import {
	CASE_INCLUDE,
	RuleConflictCoreService,
	type ConflictCaseRecord,
} from './rule-conflict-core.service';
import { RuleResolutionService } from './rule-resolution.service';
import {
	RuleRevisionStore,
	RULE_REVISION_SELECT,
} from '../rules/rule-revision-store.service';
import { COMPARISON_VERSION } from './rule-conflict-comparison';
import type {
	ConflictListQuery,
	ConflictPageQuery,
	ConflictInboxQuery,
	RefreshConflictsDto,
} from './dto/conflict-requests.dto';

const summary = (c: ConflictCaseRecord) => ({
	id: c.id,
	groupId: c.groupId,
	category: c.category,
	status: c.status,
	ruleCount: c.members.length,
	createdAt: c.createdAt,
	closedAt: c.closedAt,
});
const page = <T>(rows: T[], q: ConflictPageQuery) => ({
	items: rows.slice(0, q.limit),
	page: q.page,
	limit: q.limit,
	hasNext: rows.length > q.limit,
});
@Injectable()
export class RuleConflictsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly core: RuleConflictCoreService,
		private readonly resolutions: RuleResolutionService,
		private readonly credentials: CredentialEligibilityService,
		private readonly store: RuleRevisionStore,
	) {}
	async list(userId: string, groupId: number, q: ConflictListQuery) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				requireConflictMember(await conflictScope(tx, userId, groupId));
				const fresh = await this.core.snapshot(tx, groupId);
				const assessment = await tx.ruleConflictAssessment.findUnique({
					where: {
						groupId_sourceHash_comparisonVersion: {
							groupId,
							sourceHash: fresh.sourceHash,
							comparisonVersion: COMPARISON_VERSION,
						},
					},
				});
				const rows = await tx.ruleConflictCase.findMany({
					where: { groupId, status: q.status },
					include: CASE_INCLUDE,
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				const current = await tx.ruleConflictCase.findMany({
					where: { groupId, status: 'OPEN' },
					include: CASE_INCLUDE,
				});
				const matches =
					!!assessment &&
					current.length === fresh.conflicts.length &&
					current.every((c) =>
						fresh.conflicts.some((b) => this.core.matches(c, b)),
					);
				return {
					...page(rows.map(summary), q),
					sourceHash: fresh.sourceHash,
					comparisonVersion: COMPARISON_VERSION,
					currentConflictCount: fresh.conflicts.length,
					assessment: matches
						? 'CURRENT'
						: assessment
							? 'STALE'
							: 'UNASSESSED',
					requiresRefresh: !matches,
				};
			},
			true,
		);
	}
	async refresh(userId: string, groupId: number, dto: RefreshConflictsDto) {
		return conflictTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId], groupId);
			requireConflictMember(
				await conflictScope(tx, userId, groupId),
				true,
			);
			await this.credentials.require(userId, tx);
			if (
				dto.expectedSourceHash &&
				dto.expectedSourceHash !==
					(await this.core.snapshot(tx, groupId)).sourceHash
			)
				throw new ConflictException('Rule snapshot changed');
			return this.core.reconcile(tx, groupId, userId);
		});
	}
	async detail(userId: string, groupId: number, caseId: string) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				requireConflictMember(await conflictScope(tx, userId, groupId));
				const record = await this.resolutions.loadCase(
					tx,
					groupId,
					caseId,
				);
				const fresh = await this.core.snapshot(tx, groupId);
				const bucket = fresh.conflicts.find(
					(c) =>
						c.caseKey === record.caseKey &&
						c.sourceHash === record.sourceHash,
				);
				const members: (ReturnType<RuleRevisionStore['decode']> & {
					authorExpertId: string;
				})[] = [];
				for (const m of record.members) {
					const revision = await tx.ruleRevision.findUnique({
						where: { id: m.revisionId },
						select: RULE_REVISION_SELECT,
					});
					if (!revision)
						throw new ConflictException(
							'Conflict revision unavailable',
						);
					members.push({
						authorExpertId: m.authorExpertId,
						...this.store.decode(revision, m.ruleId),
					});
				}
				return {
					...summary(record),
					sourceHash: record.sourceHash,
					comparisonVersion: record.comparisonVersion,
					normalized: record.normalized,
					stateHash: this.core.caseHash(record),
					current:
						record.status === 'OPEN' &&
						!!bucket &&
						this.core.matches(record, bucket),
					members,
				};
			},
			true,
		);
	}
	async audit(
		userId: string,
		groupId: number,
		caseId: string,
		q: ConflictPageQuery,
	) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				requireConflictMember(await conflictScope(tx, userId, groupId));
				await this.resolutions.loadCase(tx, groupId, caseId);
				const rows = await tx.ruleConflictAudit.findMany({
					where: { groupId, caseId },
					select: {
						id: true,
						event: true,
						proposalId: true,
						actorUserId: true,
						reason: true,
						createdAt: true,
					},
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				return page(rows, q);
			},
			true,
		);
	}
	async inbox(userId: string, q: ConflictInboxQuery) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				await conflictActor(tx, userId);
				const rows = await tx.ruleConflictNotification.findMany({
					where: {
						recipientUserId: userId,
						...(q.read === 'all'
							? {}
							: {
									readAt:
										q.read === 'unread'
											? null
											: { not: null },
								}),
					},
					select: {
						id: true,
						caseId: true,
						proposalId: true,
						type: true,
						createdAt: true,
						readAt: true,
					},
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				return page(rows, q);
			},
			true,
		);
	}
	async read(userId: string, id: string) {
		return conflictTransaction(this.prisma, async (tx) => {
			await lockGroup(tx, [userId]);
			await conflictActor(tx, userId);
			const row = await tx.ruleConflictNotification.findUnique({
				where: { id, recipientUserId: userId },
				select: { id: true, readAt: true },
			});
			if (!row) throw new NotFoundException('Notification not found');
			if (!row.readAt) {
				const saved = await tx.ruleConflictNotification.update({
					where: { id },
					data: { readAt: new Date() },
					select: { id: true, readAt: true },
				});
				return saved;
			}
			return row;
		});
	}
	async adminList(userId: string, q: ConflictListQuery) {
		return conflictTransaction(
			this.prisma,
			async (tx) => {
				await conflictActor(tx, userId, 'ADMIN');
				const rows = await tx.ruleConflictCase.findMany({
					where: { status: q.status },
					include: CASE_INCLUDE,
					orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
					skip: (q.page - 1) * q.limit,
					take: q.limit + 1,
				});
				return page(rows.map(summary), q);
			},
			true,
		);
	}
	async remind(userId: string, caseId: string) {
		return conflictTransaction(this.prisma, async (tx) => {
			await conflictActor(tx, userId, 'ADMIN');
			const initial = await tx.ruleConflictCase.findUnique({
				where: { id: caseId },
				include: CASE_INCLUDE,
			});
			if (!initial) throw new NotFoundException('Conflict not found');
			await lockGroup(tx, [userId], initial.groupId);
			await conflictActor(tx, userId, 'ADMIN');
			const record = await this.resolutions.loadCase(
				tx,
				initial.groupId,
				caseId,
			);
			await this.core.requireCurrentCase(tx, record);
			const group = await tx.group.findUnique({
				where: { id: record.groupId },
				select: { archivedAt: true },
			});
			if (!group || group.archivedAt)
				throw new ConflictException('Group is archived');
			const last = await tx.ruleConflictAudit.findFirst({
				where: { caseId, event: 'ADMIN_REMINDER' },
				orderBy: { createdAt: 'desc' },
			});
			if (
				last &&
				Date.now() - last.createdAt.getTime() < 24 * 60 * 60 * 1000
			)
				throw new HttpException(
					'A reminder was already recorded within 24 hours',
					429,
				);
			const audit = await tx.ruleConflictAudit.create({
				data: {
					groupId: record.groupId,
					caseId,
					actorUserId: userId,
					event: 'ADMIN_REMINDER',
				},
			});
			const createdCount = await this.core.notify(
				tx,
				caseId,
				[
					...record.members.map((m) => m.author.userId),
					...(await this.core.leaders(tx, record.groupId)),
				],
				'ADMIN_REMINDER',
				`reminder:${audit.id}`,
			);
			return { caseId, createdCount, channel: 'IN_APP' };
		});
	}
}
