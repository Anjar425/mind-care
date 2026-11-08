import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CredentialEligibilityService } from '../credentials/credential-eligibility.service';
import { lockGroup } from '../groups/group-persistence';
import { RuleReferenceService } from '../rules/rule-reference.service';
import {
	RuleRevisionStore,
	RULE_LATEST_INCLUDE,
} from '../rules/rule-revision-store.service';
import { compileRule } from '../rules/rule-grammar';
import {
	conflictActor,
	conflictScope,
	ruleConflictTx,
	requireConflictMember,
} from '../rules/conflicts/conflict-persistence';
import {
	CASE_INCLUDE,
	RuleConflictCoreService,
	type ConflictCaseRecord,
} from '../rules/conflicts/rule-conflict-core.service';
import {
	assertProjectedCorrection,
	parseResolutionActions,
	resolutionPlanDigest,
	type ReviewedAction,
} from './conflict-plan';
import type {
	ConsentInput,
	CreateResolutionInput,
	ReasonedConsentInput,
} from './rule-conflicts.types';
import { withTransaction } from '../../infrastructure/prisma/transaction';

export const PROPOSAL_INCLUDE = {
	case: { include: CASE_INCLUDE },
	actions: { orderBy: { position: 'asc' } },
	participants: { orderBy: { expertId: 'asc' }, include: { decision: true } },
} as const satisfies Prisma.RuleResolutionProposalInclude;
export type ProposalRecord = Prisma.RuleResolutionProposalGetPayload<{
	include: typeof PROPOSAL_INCLUDE;
}>;
const rationale = (value: string) => {
	if (typeof value !== 'string' || !value.trim() || value.length > 1000)
		throw new BadRequestException(
			'A professional reason of 1 to 1000 characters is required',
		);
	return value;
};

@Injectable()
export class RuleResolutionService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly core: RuleConflictCoreService,
		private readonly credentials: CredentialEligibilityService,
		private readonly references: RuleReferenceService,
		private readonly store: RuleRevisionStore,
	) {}
	async loadCase(
		tx: Prisma.TransactionClient,
		groupId: number,
		caseId: string,
	) {
		const record = await tx.ruleConflictCase.findUnique({
			where: { id: caseId, groupId },
			include: CASE_INCLUDE,
		});
		if (!record)
			throw new NotFoundException('Conflict not found in this group');
		return record;
	}
	async load(
		tx: Prisma.TransactionClient,
		groupId: number,
		caseId: string,
		id: string,
	) {
		const record = await tx.ruleResolutionProposal.findUnique({
			where: { id, caseId },
			include: PROPOSAL_INCLUDE,
		});
		if (!record || record.case.groupId !== groupId)
			throw new NotFoundException('Proposal not found in this conflict');
		this.verify(record);
		return record;
	}
	private verify(p: ProposalRecord): ReviewedAction[] {
		try {
			const actions = p.actions.map((a, i) => {
				if (
					a.position !== i + 1 ||
					!p.case.members.some(
						(m) =>
							m.ruleId === a.ruleId &&
							m.revisionId === a.revisionId &&
							m.authorExpertId === a.authorExpertId,
					)
				)
					throw new Error('provenance');
				if (a.type === 'ARCHIVE' && a.content !== null)
					throw new Error('archive');
				return {
					ruleId: a.ruleId,
					revisionId: a.revisionId,
					type: a.type,
					content:
						a.type === 'REVISE'
							? compileRule(a.content).original
							: null,
				};
			});
			const authors = new Map(
				p.case.members.map((m) => [m.authorExpertId, m.author.userId]),
			);
			if (
				!actions.length ||
				new Set(actions.map((a) => a.ruleId)).size !== actions.length ||
				authors.size !== p.participants.length ||
				new Set(p.participants.map((a) => a.expertId)).size !==
					authors.size ||
				p.participants.some(
					(a) =>
						authors.get(a.expertId) !== a.userId ||
						(a.decision &&
							(a.decision.actorUserId !== a.userId ||
								a.decision.planDigest !== p.planDigest)),
				)
			)
				throw new Error('participants');
			if (
				resolutionPlanDigest({
					...p,
					sourceHash: p.case.sourceHash,
					comparisonVersion: p.case.comparisonVersion,
					actions,
				}) !== p.planDigest
			)
				throw new Error('digest');
			return actions;
		} catch {
			throw new ServiceUnavailableException(
				'Stored resolution evidence requires review',
			);
		}
	}
	private async periodsCurrent(
		tx: Prisma.TransactionClient,
		p: ProposalRecord,
	) {
		for (const participant of p.participants) {
			const member = await tx.groupMembership.findUnique({
				where: {
					groupId_expertId: {
						groupId: p.case.groupId,
						expertId: participant.expertId,
					},
				},
			});
			if (
				!member ||
				member.status !== 'ACTIVE' ||
				member.id !== participant.membershipId ||
				member.joinedAt.getTime() !==
					participant.membershipJoinedAt?.getTime()
			)
				return false;
		}
		return true;
	}
	async effective(tx: Prisma.TransactionClient, p: ProposalRecord) {
		if (p.status !== 'PENDING') return p.status;
		if (new Date().getTime() >= p.expiresAt.getTime())
			return 'EXPIRED' as const;
		const group = await tx.group.findUnique({
			where: { id: p.case.groupId },
			select: { archivedAt: true },
		});
		if (
			!group ||
			group.archivedAt ||
			p.case.status !== 'OPEN' ||
			!(await this.periodsCurrent(tx, p))
		)
			return 'STALE' as const;
		const s = await this.core.snapshot(tx, p.case.groupId);
		const bucket = s.conflicts.find(
			(b) =>
				b.caseKey === p.case.caseKey &&
				b.sourceHash === p.case.sourceHash,
		);
		if (!bucket) return 'STALE' as const;
		if (!this.core.matches(p.case, bucket))
			throw new ServiceUnavailableException(
				'Stored conflict evidence requires review',
			);
		return 'PENDING' as const;
	}
	private view(p: ProposalRecord, effectiveStatus: string) {
		return {
			id: p.id,
			caseId: p.caseId,
			proposerUserId: p.proposerUserId,
			planDigest: p.planDigest,
			reason: p.reason,
			status: p.status,
			effectiveStatus,
			createdAt: p.createdAt,
			expiresAt: p.expiresAt,
			decidedAt: p.decidedAt,
			actions: this.verify(p),
			participants: p.participants.map((a) => ({
				expertId: a.expertId,
				decision: a.decision
					? {
							value: a.decision.value,
							reason: a.decision.reason,
							createdAt: a.decision.createdAt,
						}
					: null,
			})),
		};
	}
	private async changed(
		tx: Prisma.TransactionClient,
		p: ProposalRecord,
		actor: string,
		event: string,
		reason?: string,
	) {
		await this.core.audit(
			tx,
			p.case.groupId,
			actor,
			event,
			p.caseId,
			p.id,
			reason,
		);
		await this.core.notify(
			tx,
			p.caseId,
			[
				...p.participants.map((a) => a.userId),
				...(await this.core.leaders(tx, p.case.groupId)),
			],
			event,
			`proposal:${p.id}:${event}`,
			p.id,
		);
	}
	private async proposer(
		tx: Prisma.TransactionClient,
		userId: string,
		groupId: number,
		record: ConflictCaseRecord,
	) {
		const scope = await conflictScope(tx, userId, groupId);
		requireConflictMember(scope, true);
		await this.credentials.require(userId, tx);
		if (!record.members.some((m) => m.authorExpertId === scope.expertId)) {
			const leaders = await this.core.leaders(tx, groupId);
			if (
				scope.membership?.role !== 'LEADER' ||
				leaders.length !== 1 ||
				leaders[0] !== userId
			)
				throw new ForbiddenException(
					'An involved author or unique current leader must propose',
				);
		}
	}
	async create(
		userId: string,
		groupId: number,
		caseId: string,
		dto: CreateResolutionInput,
	) {
		const actions = parseResolutionActions(dto.actions);
		const reason = rationale(dto.reason);
		return withTransaction(
			this.prisma,
			async (tx) => {
				await lockGroup(tx, [userId], groupId);
				const record = await this.loadCase(tx, groupId, caseId);
				await this.proposer(tx, userId, groupId, record);
				if (dto.expectedCaseStateHash !== this.core.caseHash(record))
					throw new ConflictException(
						'Conflict changed; reload before proposing',
					);
				const { snapshot } = await this.core.requireCurrentCase(
					tx,
					record,
				);
				for (const action of actions) {
					const original = snapshot.inputs.find(
						(m) => m.id === action.ruleId,
					);
					if (
						!record.members.some(
							(m) =>
								m.ruleId === action.ruleId &&
								m.revisionId === action.revisionId,
						) ||
						!original ||
						original.revisionId !== action.revisionId
					)
						throw new ConflictException(
							'Correction targets must match this conflict snapshot',
						);
					if (
						action.content &&
						JSON.stringify(original.content) ===
							JSON.stringify(action.content)
					)
						throw new BadRequestException(
							'A revised rule must change its authored content',
						);
				}
				assertProjectedCorrection(
					snapshot.inputs,
					record.caseKey,
					actions,
				);
				await this.references.resolveMany(
					actions.flatMap((a) => (a.content ? [a.content] : [])),
					tx,
				);
				const pending = await tx.ruleResolutionProposal.findFirst({
					where: { caseId, status: 'PENDING' },
					include: PROPOSAL_INCLUDE,
				});
				if (pending) {
					this.verify(pending);
					const effective = await this.effective(tx, pending);
					if (effective === 'PENDING')
						throw new ConflictException(
							'This conflict already has a pending plan',
						);
					await tx.ruleResolutionProposal.update({
						where: { id: pending.id },
						data: { status: effective, decidedAt: new Date() },
					});
					await this.changed(tx, pending, userId, effective);
				}
				const participants: {
					expertId: string;
					userId: string;
					membershipId: string | null;
					membershipJoinedAt: Date | null;
				}[] = [];
				for (const [expertId, authorUserId] of new Map(
					record.members.map((m) => [
						m.authorExpertId,
						m.author.userId,
					]),
				)) {
					const membership = await tx.groupMembership.findUnique({
						where: { groupId_expertId: { groupId, expertId } },
					});
					participants.push({
						expertId,
						userId: authorUserId,
						membershipId:
							membership?.status === 'ACTIVE'
								? membership.id
								: null,
						membershipJoinedAt:
							membership?.status === 'ACTIVE'
								? membership.joinedAt
								: null,
					});
				}
				const expiresAt = new Date(
					Date.now() + 7 * 24 * 60 * 60 * 1000,
				);
				const planDigest = resolutionPlanDigest({
					caseId,
					sourceHash: record.sourceHash,
					comparisonVersion: record.comparisonVersion,
					reason,
					expiresAt,
					actions,
					participants,
				});
				const p = await tx.ruleResolutionProposal.create({
					data: {
						caseId,
						proposerUserId: userId,
						reason,
						expiresAt,
						planDigest,
						actions: {
							create: actions.map((a, i) => ({
								ruleId: a.ruleId,
								revisionId: a.revisionId,
								authorExpertId: record.members.find(
									(m) => m.ruleId === a.ruleId,
								)!.authorExpertId,
								type: a.type,
								position: i + 1,
								...(a.content
									? {
											content:
												a.content as unknown as Prisma.InputJsonValue,
										}
									: {}),
							})),
						},
						participants: { create: participants },
					},
					include: PROPOSAL_INCLUDE,
				});
				this.verify(p);
				await this.changed(tx, p, userId, 'PROPOSED', reason);
				return this.view(p, await this.effective(tx, p));
			},
			ruleConflictTx(),
		);
	}
	async detail(userId: string, groupId: number, caseId: string, id: string) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				requireConflictMember(await conflictScope(tx, userId, groupId));
				const p = await this.load(tx, groupId, caseId, id);
				return this.view(p, await this.effective(tx, p));
			},
			ruleConflictTx(true),
		);
	}
	async decide(
		userId: string,
		groupId: number,
		caseId: string,
		id: string,
		dto: ConsentInput | ReasonedConsentInput,
		value: 'APPROVE' | 'REJECT' | 'CANCEL',
	) {
		if (value !== 'APPROVE')
			rationale((dto as ReasonedConsentInput).reason);
		return withTransaction(
			this.prisma,
			async (tx) => {
				// Discover immutable required identities before acquiring the shared User -> Group -> Rule locks.
				const initial = await this.load(tx, groupId, caseId, id);
				await lockGroup(
					tx,
					[userId, ...initial.participants.map((p) => p.userId)],
					groupId,
				);
				for (const ruleId of initial.case.members
					.map((m) => m.ruleId)
					.sort((a, b) => a - b))
					await tx.$queryRaw`SELECT "id" FROM "Rule" WHERE "id" = ${ruleId} AND "groupId" = ${groupId} FOR UPDATE`;
				await tx.$queryRaw`SELECT "id" FROM "RuleResolutionProposal" WHERE "id" = ${id} FOR UPDATE`;
				const p = await this.load(tx, groupId, caseId, id);
				const actor = await conflictActor(tx, userId);
				if (dto.planDigest !== p.planDigest)
					throw new ConflictException(
						'Review the exact current plan digest',
					);
				const own = p.participants.find(
					(a) => a.userId === userId && a.expertId === actor.expertId,
				);
				if (value === 'CANCEL') {
					if (!own) {
						await this.proposer(tx, userId, groupId, p.case);
						if (
							p.proposerUserId !== userId &&
							!(await this.core.leaders(tx, groupId)).includes(
								userId,
							)
						)
							throw new ForbiddenException(
								'Only a required author, proposer or current leader may cancel',
							);
					}
					if (p.status === 'CANCELLED')
						return { id: p.id, status: p.status };
					if (p.status !== 'PENDING')
						throw new ConflictException(
							'Only pending plans may be withdrawn',
						);
					await tx.ruleResolutionProposal.update({
						where: { id },
						data: { status: 'CANCELLED', decidedAt: new Date() },
					});
					await this.changed(
						tx,
						p,
						userId,
						'CANCELLED',
						(dto as ReasonedConsentInput).reason,
					);
					return { id, status: 'CANCELLED' };
				}
				requireConflictMember(
					await conflictScope(tx, userId, groupId),
					true,
				);
				await this.credentials.require(userId, tx);
				if (!own)
					throw new ForbiddenException(
						'Only a required conflict author may decide',
					);
				if (own.decision) {
					if (own.decision.value !== value)
						throw new ConflictException(
							'A recorded decision is immutable; withdraw a pending plan instead',
						);
					if (p.status === 'APPLIED' || p.status === 'REJECTED')
						return this.view(p, p.status);
				}
				const effective = await this.effective(tx, p);
				if (effective !== 'PENDING')
					throw new ConflictException(
						`Plan is ${effective.toLowerCase()}; submit a fresh proposal`,
					);
				await this.core.requireCurrentCase(tx, p.case);
				if (!own.decision)
					await tx.ruleResolutionDecision.create({
						data: {
							participantId: own.id,
							actorUserId: userId,
							planDigest: p.planDigest,
							value,
							reason:
								value === 'REJECT'
									? (dto as ReasonedConsentInput).reason
									: undefined,
						},
					});
				if (value === 'REJECT') {
					await tx.ruleResolutionProposal.update({
						where: { id },
						data: { status: 'REJECTED', decidedAt: new Date() },
					});
					await this.changed(
						tx,
						p,
						userId,
						'REJECTED',
						(dto as ReasonedConsentInput).reason,
					);
				} else {
					const voted = await this.load(tx, groupId, caseId, id);
					if (
						voted.participants.every(
							(a) => a.decision?.value === 'APPROVE',
						)
					)
						await this.apply(tx, voted, userId);
					else if (!own.decision)
						await this.changed(
							tx,
							p,
							userId,
							`APPROVED:${own.expertId}`,
						);
				}
				const result = await this.load(tx, groupId, caseId, id);
				return this.view(result, await this.effective(tx, result));
			},
			ruleConflictTx(),
		);
	}
	private async apply(
		tx: Prisma.TransactionClient,
		p: ProposalRecord,
		userId: string,
	) {
		const actions = this.verify(p);
		const { snapshot } = await this.core.requireCurrentCase(tx, p.case);
		if ((await this.effective(tx, p)) !== 'PENDING')
			throw new ConflictException('Plan is no longer applicable');
		for (const participant of p.participants) {
			const scope = await conflictScope(
				tx,
				participant.userId,
				p.case.groupId,
			);
			requireConflictMember(scope, true);
			if (scope.expertId !== participant.expertId)
				throw new ConflictException('Required author identity changed');
			await this.credentials.require(participant.userId, tx);
		}
		assertProjectedCorrection(snapshot.inputs, p.case.caseKey, actions);
		const conclusions = await this.references.resolveMany(
			actions.flatMap((a) => (a.content ? [a.content] : [])),
			tx,
		);
		let index = 0;
		const now = new Date();
		for (const action of actions) {
			const rule = await tx.rule.findUnique({
				where: { id: action.ruleId, groupId: p.case.groupId },
				include: RULE_LATEST_INCLUDE,
			});
			if (
				!rule ||
				rule.archivedAt ||
				rule.revisions[0]?.id !== action.revisionId
			)
				throw new ConflictException('Rule revision changed');
			const current = this.store.decode(rule.revisions[0], rule.id);
			let revisionId = current.revisionId;
			if (action.content) {
				if (current.version >= 2147483647)
					throw new ConflictException(
						'Rule revision version exhausted',
					);
				const revision = await this.store.append(
					tx,
					rule.id,
					current.version + 1,
					compileRule(action.content),
					conclusions[index++],
					now,
				);
				revisionId = revision.id;
			}
			await tx.rule.update({
				where: { id: rule.id },
				data: {
					updatedAt: new Date(
						Math.max(now.getTime(), rule.updatedAt.getTime() + 1),
					),
					...(action.type === 'ARCHIVE' ? { archivedAt: now } : {}),
				},
			});
			await tx.ruleAudit.create({
				data: {
					ruleId: rule.id,
					revisionId,
					actorUserId: userId,
					action: action.type === 'ARCHIVE' ? 'ARCHIVED' : 'REVISED',
					reason: p.reason,
					createdAt: now,
					resolutionProposalId: p.id,
				},
			});
			const saved = await tx.rule.findUnique({
				where: { id: rule.id, groupId: p.case.groupId },
				include: RULE_LATEST_INCLUDE,
			});
			if (
				!saved ||
				(action.type === 'ARCHIVE'
					? !saved.archivedAt
					: JSON.stringify(
							this.store.decode(saved.revisions[0], saved.id)
								.content,
						) !== JSON.stringify(action.content))
			)
				throw new ServiceUnavailableException(
					'Resolution readback failed',
				);
		}
		const after = await this.core.snapshot(tx, p.case.groupId);
		if (
			after.conflicts.some(
				(c) =>
					c.caseKey === p.case.caseKey ||
					!snapshot.conflicts.some(
						(b) =>
							b.caseKey === c.caseKey &&
							b.sourceHash === c.sourceHash,
					),
			)
		)
			throw new ServiceUnavailableException(
				'Resolution conflict verification failed',
			);
		await tx.ruleResolutionProposal.update({
			where: { id: p.id },
			data: { status: 'APPLIED', decidedAt: now },
		});
		await this.core.reconcile(tx, p.case.groupId, userId, p.caseId, p.id);
		await this.changed(tx, p, userId, 'APPLIED');
	}
}
