import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	HttpException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
	RuleRevisionStore,
	RULE_LATEST_INCLUDE,
	RULE_REVISION_SELECT,
	type StoredRule,
} from './rule-revision-store.service';
export type { StoredRuleRevision } from './rule-revision-store.service';
import { RuleConflictCoreService } from '../rule-conflicts/rule-conflict-core.service';
import type { Prisma, RuleAction } from '../prisma/generated/client';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { assertCredentialEligibility } from '../expert-credentials/credential-policy';
import { lockGroup } from '../groups/group-persistence';
import { compileRule } from './rule-grammar';
import { requireRuleRead, requireRuleWrite } from './rule-policy';
import { ruleStateHash } from './rule-state.util';
import { RuleReferenceService } from './rule-reference.service';
import type {
	ArchiveRuleDto,
	CreateRuleDto,
	RulesPageQuery,
	RulesQuery,
	UpdateRuleDto,
} from './dto/rule-requests.dto';

// Authored revisions only. No conflict approval or inference-ready export.
@Injectable()
export class RulesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialEligibilityService,
		private readonly references: RuleReferenceService,
		private readonly store: RuleRevisionStore,
		private readonly conflicts: RuleConflictCoreService,
	) {}
	private async transaction<T>(
		work: (tx: Prisma.TransactionClient) => Promise<T>,
		read = false,
	): Promise<T> {
		try {
			return await this.prisma.$transaction(work, {
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
					'Concurrent rule change; reload and retry',
				);
			throw new ServiceUnavailableException(
				'Rule persistence unavailable',
			);
		}
	}
	private async actor(tx: Prisma.TransactionClient, userId: string) {
		const actor = await tx.user.findUnique({
			where: { id: userId },
			select: { role: true, expert: { select: { id: true } } },
		});
		if (!actor || actor.role !== 'EXPERT')
			throw new ForbiddenException('Current expert account required');
		return actor.expert?.id ?? null;
	}
	private async scope(
		tx: Prisma.TransactionClient,
		userId: string,
		groupId: number,
	) {
		const actorExpertId = await this.actor(tx, userId);
		const group = await tx.group.findUnique({
			where: { id: groupId },
			select: { id: true, archivedAt: true },
		});
		if (!group) throw new NotFoundException('Group not found');
		const membership = actorExpertId
			? await tx.groupMembership.findUnique({
					where: {
						groupId_expertId: { groupId, expertId: actorExpertId },
					},
					select: { status: true },
				})
			: null;
		return {
			actorExpertId,
			archivedAt: group.archivedAt,
			activeMember: membership?.status === 'ACTIVE',
		};
	}
	private async load(
		tx: Prisma.TransactionClient,
		groupId: number,
		ruleId: number,
		saved = false,
	) {
		const rule = await tx.rule.findUnique({
			where: { id: ruleId, groupId },
			include: RULE_LATEST_INCLUDE,
		});
		if (!rule) {
			if (saved)
				throw new ServiceUnavailableException(
					'Saved rule verification failed',
				);
			throw new NotFoundException('Rule not found in this group');
		}
		return rule;
	}
	private current(rule: StoredRule) {
		const row = rule.revisions[0];
		if (!row)
			throw new ServiceUnavailableException(
				'Stored rule has no authored revision',
			);
		const revision = this.store.decode(row, rule.id);
		return {
			id: rule.id,
			groupId: rule.groupId,
			authorExpertId: rule.authorExpertId,
			authorName: rule.author.user.name,
			version: revision.version,
			catalogVersion: revision.catalogVersion,
			category: revision.content.conclusion.category,
			severity: revision.content.conclusion.severity,
			createdAt: rule.createdAt,
			updatedAt: rule.updatedAt,
			archivedAt: rule.archivedAt,
			grammarVersion: revision.grammarVersion,
			canonicalVersion: revision.canonicalVersion,
			content: revision.content,
			stateHash: ruleStateHash(rule, row),
		};
	}
	private summary(rule: StoredRule) {
		const {
			content: _content,
			stateHash: _state,
			grammarVersion: _grammar,
			canonicalVersion: _canonical,
			...summary
		} = this.current(rule);
		void _content;
		void _state;
		void _grammar;
		void _canonical;
		return summary;
	}
	private compare(rule: StoredRule, expected: string) {
		if (!/^[a-f0-9]{64}$/.test(expected))
			throw new BadRequestException(
				'expectedStateHash must be the current SHA-256 state',
			);
		if (this.current(rule).stateHash !== expected)
			throw new ConflictException(
				'Rule changed; reload before submitting',
			);
		if (rule.archivedAt) throw new ConflictException('Rule is archived');
	}
	private async writer(tx: Prisma.TransactionClient, userId: string) {
		const expert = await this.credentials.find(userId, tx);
		assertCredentialEligibility(expert, new Date());
	}
	private async audit(
		tx: Prisma.TransactionClient,
		ruleId: number,
		revisionId: string,
		actorUserId: string,
		action: RuleAction,
		now: Date,
		reason?: string,
	) {
		await tx.ruleAudit.create({
			data: {
				ruleId,
				revisionId,
				actorUserId,
				action,
				createdAt: now,
				reason,
			},
		});
	}
	async create(userId: string, groupId: number, dto: CreateRuleDto) {
		const compiled = compileRule(dto);
		return this.transaction(async (tx) => {
			await lockGroup(tx, [userId], groupId);
			const scope = await this.scope(tx, userId, groupId);
			requireRuleWrite(scope);
			const conclusionId = await this.references.resolve(
				compiled.original,
				tx,
			);
			await this.writer(tx, userId);
			const now = new Date();
			const rule = await tx.rule.create({
				data: {
					groupId,
					authorExpertId: scope.actorExpertId!,
					createdAt: now,
					updatedAt: now,
				},
			});
			const revision = await this.store.append(
				tx,
				rule.id,
				1,
				compiled,
				conclusionId,
				now,
			);
			await this.audit(tx, rule.id, revision.id, userId, 'CREATED', now);
			await this.conflicts.reconcile(tx, groupId, userId);
			return this.current(await this.load(tx, groupId, rule.id, true));
		});
	}
	async detail(userId: string, groupId: number, ruleId: number) {
		return this.transaction(async (tx) => {
			const scope = await this.scope(tx, userId, groupId);
			const rule = await this.load(tx, groupId, ruleId);
			requireRuleRead(
				rule.authorExpertId,
				scope.actorExpertId,
				scope.activeMember,
			);
			return this.current(rule);
		}, true);
	}
	async update(
		userId: string,
		groupId: number,
		ruleId: number,
		dto: UpdateRuleDto,
	) {
		const compiled = compileRule(dto, true);
		return this.transaction(async (tx) => {
			await lockGroup(tx, [userId], groupId);
			await tx.$queryRaw`SELECT "id" FROM "Rule" WHERE "id" = ${ruleId} AND "groupId" = ${groupId} FOR UPDATE`;
			const scope = await this.scope(tx, userId, groupId);
			const rule = await this.load(tx, groupId, ruleId);
			requireRuleWrite(scope, rule.authorExpertId);
			this.compare(rule, dto.expectedStateHash);
			await this.conflicts.assertDirectWriteAllowed(tx, groupId, ruleId);
			const conclusionId = await this.references.resolve(
				compiled.original,
				tx,
			);
			await this.writer(tx, userId);
			const current = this.current(rule);
			if (
				JSON.stringify(current.content) ===
				JSON.stringify(compiled.original)
			)
				return current;
			if (current.version >= 2147483647)
				throw new ConflictException('Rule revision version exhausted');
			const now = new Date();
			const revision = await this.store.append(
				tx,
				rule.id,
				current.version + 1,
				compiled,
				conclusionId,
				now,
			);
			await tx.rule.update({
				where: { id: rule.id },
				data: {
					updatedAt: new Date(
						Math.max(now.getTime(), rule.updatedAt.getTime() + 1),
					),
				},
			});
			await this.audit(tx, rule.id, revision.id, userId, 'REVISED', now);
			await this.conflicts.reconcile(tx, groupId, userId);
			return this.current(await this.load(tx, groupId, ruleId, true));
		});
	}
	async archive(
		userId: string,
		groupId: number,
		ruleId: number,
		dto: ArchiveRuleDto,
	) {
		if (
			typeof dto.reason !== 'string' ||
			!dto.reason.trim() ||
			dto.reason.length > 1000
		)
			throw new BadRequestException(
				'A professional archive reason of 1 to 1000 characters is required',
			);
		return this.transaction(async (tx) => {
			await lockGroup(tx, [userId], groupId);
			await tx.$queryRaw`SELECT "id" FROM "Rule" WHERE "id" = ${ruleId} AND "groupId" = ${groupId} FOR UPDATE`;
			const scope = await this.scope(tx, userId, groupId);
			const rule = await this.load(tx, groupId, ruleId);
			requireRuleWrite(scope, rule.authorExpertId);
			this.compare(rule, dto.expectedStateHash);
			await this.conflicts.assertDirectWriteAllowed(tx, groupId, ruleId);
			await this.writer(tx, userId);
			const now = new Date();
			await tx.rule.update({
				where: { id: ruleId },
				data: {
					archivedAt: now,
					updatedAt: new Date(
						Math.max(now.getTime(), rule.updatedAt.getTime() + 1),
					),
				},
			});
			await this.audit(
				tx,
				ruleId,
				rule.revisions[0].id,
				userId,
				'ARCHIVED',
				now,
				dto.reason,
			);
			await this.conflicts.reconcile(tx, groupId, userId);
			return this.current(await this.load(tx, groupId, ruleId, true));
		});
	}
	private async page(
		tx: Prisma.TransactionClient,
		where: Prisma.RuleWhereInput,
		q: RulesQuery,
	) {
		const filter: Prisma.RuleWhereInput = {
			...where,
			...(q.lifecycle === 'all'
				? {}
				: {
						archivedAt:
							q.lifecycle === 'active' ? null : { not: null },
					}),
		};
		const offset = (q.page - 1) * q.limit;
		const items: ReturnType<RulesService['summary']>[] = [];
		let cursor = q.category ? 0 : offset;
		let matched = 0;
		const batch = q.category ? 100 : q.limit + 1;
		while (items.length <= q.limit) {
			const rows = await tx.rule.findMany({
				where: filter,
				orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
				include: RULE_LATEST_INCLUDE,
				skip: cursor,
				take: batch,
			});
			cursor += rows.length;
			for (const rule of rows) {
				const summary = this.summary(rule);
				if (q.category && summary.category !== q.category) continue;
				if (q.category && matched++ < offset) continue;
				items.push(summary);
				if (items.length > q.limit) break;
			}
			if (rows.length < batch || !q.category) break;
		}
		return {
			items: items.slice(0, q.limit),
			page: q.page,
			limit: q.limit,
			hasNext: items.length > q.limit,
		};
	}
	async list(userId: string, groupId: number, q: RulesQuery) {
		return this.transaction(async (tx) => {
			const scope = await this.scope(tx, userId, groupId);
			if (!scope.activeMember)
				throw new ForbiddenException(
					'Active group membership required',
				);
			return this.page(tx, { groupId }, q);
		}, true);
	}
	async mine(userId: string, q: RulesQuery) {
		return this.transaction(async (tx) => {
			const authorExpertId = await this.actor(tx, userId);
			if (!authorExpertId)
				return {
					items: [],
					page: q.page,
					limit: q.limit,
					hasNext: false,
				};
			return this.page(tx, { authorExpertId }, q);
		}, true);
	}
	async revisions(
		userId: string,
		groupId: number,
		ruleId: number,
		q: RulesPageQuery,
	) {
		return this.transaction(async (tx) => {
			const scope = await this.scope(tx, userId, groupId);
			const rule = await this.load(tx, groupId, ruleId);
			requireRuleRead(
				rule.authorExpertId,
				scope.actorExpertId,
				scope.activeMember,
			);
			this.current(rule);
			const rows = await tx.ruleRevision.findMany({
				where: { ruleId },
				orderBy: { version: 'desc' },
				skip: (q.page - 1) * q.limit,
				take: q.limit + 1,
				select: RULE_REVISION_SELECT,
			});
			const items = rows.slice(0, q.limit).map((row) => {
				const { content, ...summary } = this.store.decode(row, ruleId);
				return {
					...summary,
					category: content.conclusion.category,
					severity: content.conclusion.severity,
				};
			});
			return {
				items,
				page: q.page,
				limit: q.limit,
				hasNext: rows.length > q.limit,
			};
		}, true);
	}
	async revisionDetail(
		userId: string,
		groupId: number,
		ruleId: number,
		version: number,
	) {
		return this.transaction(async (tx) => {
			const scope = await this.scope(tx, userId, groupId);
			const rule = await this.load(tx, groupId, ruleId);
			requireRuleRead(
				rule.authorExpertId,
				scope.actorExpertId,
				scope.activeMember,
			);
			const row = await tx.ruleRevision.findUnique({
				where: { ruleId_version: { ruleId, version } },
				select: RULE_REVISION_SELECT,
			});
			if (!row) throw new NotFoundException('Rule revision not found');
			return this.store.decode(row, ruleId);
		}, true);
	}
}
