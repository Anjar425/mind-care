import {
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import { compileRule } from '../rules/rule-grammar';
import {
	RuleRevisionStore,
	RULE_LATEST_INCLUDE,
} from '../rules/rule-revision-store.service';
import {
	COMPARISON_VERSION,
	digest,
	findConflicts,
	type ConflictInput,
	type ConflictBucket,
} from './rule-conflict-comparison';

export const CASE_INCLUDE = {
	members: {
		orderBy: { ruleId: 'asc' },
		include: { author: { select: { userId: true } } },
	},
} as const satisfies Prisma.RuleConflictCaseInclude;
export type ConflictCaseRecord = Prisma.RuleConflictCaseGetPayload<{
	include: typeof CASE_INCLUDE;
}>;

@Injectable()
export class RuleConflictCoreService {
	constructor(private readonly store: RuleRevisionStore) {}
	async snapshot(
		tx: Prisma.TransactionClient,
		groupId: number,
		expertIds?: readonly string[],
		maxRules?: number,
	) {
		if (
			maxRules !== undefined &&
			(!Number.isSafeInteger(maxRules) || maxRules < 1)
		)
			throw new ServiceUnavailableException(
				'Invalid inference source capacity',
			);
		const inputs: ConflictInput[] = [];
		let skip = 0;
		while (true) {
			const take =
				maxRules === undefined
					? 100
					: Math.min(100, maxRules - inputs.length + 1);
			const rows = await tx.rule.findMany({
				where: {
					groupId,
					archivedAt: null,
					...(expertIds
						? { authorExpertId: { in: [...expertIds] } }
						: {}),
				},
				orderBy: { id: 'asc' },
				skip,
				take,
				include: RULE_LATEST_INCLUDE,
			});
			if (
				maxRules !== undefined &&
				inputs.length + rows.length > maxRules
			)
				throw new ConflictException(
					'DASS42 inference rule capacity exceeded; no partial ruleset was used',
				);
			for (const row of rows) {
				const revision = row.revisions[0];
				if (!revision)
					throw new ServiceUnavailableException(
						'Stored rule has no authored revision',
					);
				const decoded = this.store.decode(revision, row.id);
				inputs.push({
					id: row.id,
					revisionId: revision.id,
					version: revision.version,
					authorExpertId: row.authorExpertId,
					authorUserId: row.author.userId,
					grammarVersion: revision.grammarVersion,
					content: decoded.content,
					antecedent: compileRule(decoded.content).antecedent,
				});
			}
			skip += rows.length;
			if (rows.length < take) break;
		}
		inputs.sort((a, b) => a.id - b.id);
		const manifest = inputs.map((r) => [
			r.id,
			r.revisionId,
			r.version,
			r.authorExpertId,
			r.authorUserId,
			digest(r.content),
		]);
		return {
			inputs,
			manifest,
			sourceHash: digest([groupId, COMPARISON_VERSION, manifest]),
			conflicts: findConflicts(inputs),
		};
	}
	async assertDirectWriteAllowed(
		tx: Prisma.TransactionClient,
		groupId: number,
		ruleId: number,
	) {
		const snapshot = await this.snapshot(tx, groupId);
		if (
			snapshot.conflicts.some((c) =>
				c.members.some((m) => m.id === ruleId),
			)
		)
			throw new ConflictException(
				'Rule has an active conflict; use a resolution approved by all conflict authors',
			);
	}
	matches(record: ConflictCaseRecord, bucket: ConflictBucket) {
		return (
			record.comparisonVersion === COMPARISON_VERSION &&
			record.caseKey === bucket.caseKey &&
			record.sourceHash === bucket.sourceHash &&
			record.category === bucket.category &&
			JSON.stringify(record.normalized) ===
				JSON.stringify(bucket.normalized) &&
			record.members.length === bucket.members.length &&
			record.members.every((m, i) => {
				const r = bucket.members[i];
				return (
					m.ruleId === r.id &&
					m.revisionId === r.revisionId &&
					m.authorExpertId === r.authorExpertId &&
					m.severity === r.content.conclusion.severity
				);
			})
		);
	}
	async requireCurrentCase(
		tx: Prisma.TransactionClient,
		record: ConflictCaseRecord,
	) {
		const snapshot = await this.snapshot(tx, record.groupId);
		const bucket = snapshot.conflicts.find(
			(c) =>
				c.caseKey === record.caseKey &&
				c.sourceHash === record.sourceHash,
		);
		if (record.status !== 'OPEN' || !bucket)
			throw new ConflictException(
				'Conflict snapshot changed; refresh before deciding',
			);
		if (!this.matches(record, bucket))
			throw new ServiceUnavailableException(
				'Stored conflict evidence requires review',
			);
		return { snapshot, bucket };
	}
	caseHash(record: ConflictCaseRecord) {
		return digest([
			record.id,
			record.groupId,
			record.caseKey,
			record.sourceHash,
			record.comparisonVersion,
			record.status,
		]);
	}
	async audit(
		tx: Prisma.TransactionClient,
		groupId: number,
		actorUserId: string,
		event: string,
		caseId?: string,
		proposalId?: string,
		reason?: string,
	) {
		await tx.ruleConflictAudit.create({
			data: { groupId, actorUserId, event, caseId, proposalId, reason },
		});
	}
	async leaders(tx: Prisma.TransactionClient, groupId: number) {
		const leaders = await tx.groupMembership.findMany({
			where: { groupId, status: 'ACTIVE', role: 'LEADER' },
			select: { expert: { select: { userId: true } } },
		});
		return leaders.map((m) => m.expert.userId);
	}
	async notify(
		tx: Prisma.TransactionClient,
		caseId: string,
		userIds: readonly string[],
		type: string,
		eventKey: string,
		proposalId?: string,
	) {
		const users = await tx.user.findMany({
			where: { id: { in: [...new Set(userIds)] }, role: 'EXPERT' },
			select: { id: true },
		});
		const result = await tx.ruleConflictNotification.createMany({
			data: users.map((u) => ({
				caseId,
				proposalId,
				recipientUserId: u.id,
				type,
				eventKey,
			})),
			skipDuplicates: true,
		});
		return result.count;
	}
	async reconcile(
		tx: Prisma.TransactionClient,
		groupId: number,
		actorUserId: string,
		resolvedCaseId?: string,
		proposalId?: string,
	) {
		const snapshot = await this.snapshot(tx, groupId);
		const existingAssessment = await tx.ruleConflictAssessment.findUnique({
			where: {
				groupId_sourceHash_comparisonVersion: {
					groupId,
					sourceHash: snapshot.sourceHash,
					comparisonVersion: COMPARISON_VERSION,
				},
			},
		});
		const assessment =
			existingAssessment ??
			(await tx.ruleConflictAssessment.create({
				data: {
					groupId,
					sourceHash: snapshot.sourceHash,
					comparisonVersion: COMPARISON_VERSION,
					sourceManifest: snapshot.manifest,
				},
			}));
		if (
			assessment.groupId !== groupId ||
			assessment.sourceHash !== snapshot.sourceHash ||
			assessment.comparisonVersion !== COMPARISON_VERSION ||
			JSON.stringify(assessment.sourceManifest) !==
				JSON.stringify(snapshot.manifest)
		)
			throw new ServiceUnavailableException(
				'Stored conflict assessment requires review',
			);
		const open = await tx.ruleConflictCase.findMany({
			where: { groupId, status: 'OPEN' },
			include: CASE_INCLUDE,
		});
		const leaders = await this.leaders(tx, groupId);
		const currentIds: string[] = [];
		for (const bucket of snapshot.conflicts) {
			let record = await tx.ruleConflictCase.findUnique({
				where: {
					groupId_caseKey_sourceHash: {
						groupId,
						caseKey: bucket.caseKey,
						sourceHash: bucket.sourceHash,
					},
				},
				include: CASE_INCLUDE,
			});
			if (record) {
				if (record.status !== 'OPEN' || !this.matches(record, bucket))
					throw new ServiceUnavailableException(
						'Conflict evidence requires review',
					);
			} else {
				record = await tx.ruleConflictCase.create({
					data: {
						groupId,
						assessmentId: assessment.id,
						caseKey: bucket.caseKey,
						sourceHash: bucket.sourceHash,
						comparisonVersion: COMPARISON_VERSION,
						normalized: bucket.normalized,
						category: bucket.category,
						members: {
							create: bucket.members.map((m) => ({
								ruleId: m.id,
								revisionId: m.revisionId,
								authorExpertId: m.authorExpertId,
								severity: m.content.conclusion.severity,
							})),
						},
					},
					include: CASE_INCLUDE,
				});
				if (!this.matches(record, bucket))
					throw new ServiceUnavailableException(
						'Conflict readback failed',
					);
				await this.audit(
					tx,
					groupId,
					actorUserId,
					'DETECTED',
					record.id,
				);
				await this.notify(
					tx,
					record.id,
					[...leaders, ...bucket.members.map((m) => m.authorUserId)],
					'CONFLICT_DETECTED',
					`case:${record.id}:detected`,
				);
			}
			currentIds.push(record.id);
		}
		for (const record of open) {
			if (currentIds.includes(record.id)) continue;
			const status =
				record.id === resolvedCaseId ? 'RESOLVED' : 'SUPERSEDED';
			await tx.ruleConflictCase.update({
				where: { id: record.id },
				data: { status, closedAt: new Date() },
			});
			await tx.ruleResolutionProposal.updateMany({
				where: {
					caseId: record.id,
					status: 'PENDING',
					...(proposalId ? { id: { not: proposalId } } : {}),
				},
				data: { status: 'STALE', decidedAt: new Date() },
			});
			await this.audit(
				tx,
				groupId,
				actorUserId,
				status,
				record.id,
				record.id === resolvedCaseId ? proposalId : undefined,
			);
			await this.notify(
				tx,
				record.id,
				[...leaders, ...record.members.map((m) => m.author.userId)],
				status === 'RESOLVED'
					? 'CONFLICT_RESOLVED'
					: 'CONFLICT_SUPERSEDED',
				`case:${record.id}:${status}`,
				record.id === resolvedCaseId ? proposalId : undefined,
			);
		}
		return {
			assessmentId: assessment.id,
			sourceHash: snapshot.sourceHash,
			comparisonVersion: COMPARISON_VERSION,
			currentConflictCount: snapshot.conflicts.length,
			caseIds: currentIds,
		};
	}
}
