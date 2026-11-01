import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	ServiceUnavailableException,
} from '@nestjs/common';
import {
	conflictFixture,
	conflictServices,
} from '../../test/rule-conflicts-fixture';
import { groupUserId } from '../../test/groups-mocks';
import { validRuleContent } from '../../test/rules-mocks';
import {
	ConflictListQuery,
	ConflictInboxQuery,
} from './dto/conflict-requests.dto';

describe('All-author conflict resolution with synthetic transactional persistence', () => {
	it('should apply an optional inference limit without changing uncapped governance or author eligibility', async () => {
		const limited = await conflictFixture();
		const tx = limited.m.tx as unknown as Parameters<
			typeof limited.core.snapshot
		>[0];
		await expect(
			limited.assessment.readCurrentConflictFreeSnapshot(
				limited.groupId,
				tx,
				1,
			),
		).rejects.toThrow('capacity exceeded');
		limited.m.groups.state.experts[1].profileValidatedAt = null;
		expect(
			(
				await limited.assessment.readCurrentConflictFreeSnapshot(
					limited.groupId,
					tx,
					1,
				)
			).rules.map((r) => r.id),
		).toEqual([limited.a.id]);
		expect(
			(await limited.core.snapshot(tx, limited.groupId)).inputs,
		).toHaveLength(2);
	});
	let f: Awaited<ReturnType<typeof conflictFixture>>;
	beforeEach(async () => {
		f = await conflictFixture();
	});
	const approve = (
		f: Awaited<ReturnType<typeof conflictFixture>>,
		id: string,
		planDigest: string,
		n: number,
	) =>
		f.resolutions.decide(
			groupUserId(n),
			f.groupId,
			f.caseId,
			id,
			{ planDigest },
			'APPROVE',
		);
	it('preserves both authored inputs, records one case and deduplicated durable notices', async () => {
		expect(f.m.state.revisions).toHaveLength(2);
		expect(f.m.conflicts.state.case).toHaveLength(1);
		expect(f.m.conflicts.state.notice).toHaveLength(2);
		await f.conflicts.refresh(groupUserId(1), f.groupId, {});
		expect(f.m.conflicts.state.case).toHaveLength(1);
		expect(f.m.conflicts.state.notice).toHaveLength(2);
		expect(
			(
				await f.conflicts.list(
					groupUserId(1),
					f.groupId,
					new ConflictListQuery(),
				)
			).assessment,
		).toBe('CURRENT');
	});
	it('blocks normal Task 8 update and archive on a fresh conflict even if cached cases are absent', async () => {
		f.m.conflicts.state.case = [];
		await expect(
			f.rules.update(groupUserId(1), f.groupId, f.a.id, {
				...validRuleContent(),
				expectedStateHash: f.a.stateHash,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		await expect(
			f.rules.archive(groupUserId(1), f.groupId, f.a.id, {
				reason: 'Withdraw',
				expectedStateHash: f.a.stateHash,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('requires unchanged counterpart approval and applies only with the last author, retaining original authorship', async () => {
		const p = await f.proposal();
		expect(p.participants).toHaveLength(2);
		expect(p.participants.every((a) => a.decision === null)).toBe(true);
		expect((await approve(f, p.id, p.planDigest, 2)).status).toBe(
			'PENDING',
		);
		expect(f.m.state.revisions).toHaveLength(2);
		expect((await approve(f, p.id, p.planDigest, 1)).status).toBe(
			'APPLIED',
		);
		expect(f.m.state.revisions).toHaveLength(3);
		expect(f.m.conflicts.state.case[0].status).toBe('RESOLVED');
		expect(f.m.state.rules[1].authorExpertId).toBe(f.b.authorExpertId);
		expect(f.m.state.audits.at(-1)?.resolutionProposalId).toBe(p.id);
		expect((await approve(f, p.id, p.planDigest, 1)).status).toBe(
			'APPLIED',
		);
		expect(f.m.state.revisions).toHaveLength(3);
	});
	it('allows credentials-only contributions with incomplete profiles/preferences', async () => {
		f.m.groups.state.experts[0].profileValidatedAt = null;
		f.m.groups.state.experts[0].preferences = [];
		const p = await f.proposal();
		expect((await approve(f, p.id, p.planDigest, 1)).status).toBe(
			'PENDING',
		);
	});
	it('does not let a nonauthor leader, other member or admin substitute an author vote', async () => {
		const p = await f.proposal();
		await expect(approve(f, p.id, p.planDigest, 3)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		f.m.groups.state.experts[2].user.role = 'ADMIN';
		await expect(approve(f, p.id, p.planDigest, 3)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		expect(f.m.conflicts.state.decision).toHaveLength(0);
	});
	it('rejects a second pending proposal and wrong review digest', async () => {
		const p = await f.proposal();
		await expect(f.proposal()).rejects.toBeInstanceOf(ConflictException);
		await expect(
			approve(f, p.id, '0'.repeat(64), 1),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('records rejection without mutating rules and allows a fresh plan', async () => {
		const p = await f.proposal();
		const before = structuredClone(f.m.state);
		const r = await f.resolutions.decide(
			groupUserId(2),
			f.groupId,
			f.caseId,
			p.id,
			{
				planDigest: p.planDigest,
				reason: 'Keep this rule; review alternatives',
			},
			'REJECT',
		);
		expect(r.status).toBe('REJECTED');
		expect(f.m.state).toEqual(before);
		expect((await f.proposal()).id).not.toBe(p.id);
	});
	it('allows required-author withdrawal after membership/credential loss; votes are retained', async () => {
		const p = await f.proposal();
		await approve(f, p.id, p.planDigest, 2);
		f.m.groups.state.memberships.find(
			(m) => m.expertId === f.b.authorExpertId,
		)!.status = 'LEFT';
		f.m.groups.state.experts[1].credentialSuspendedAt = new Date();
		expect(
			await f.resolutions.decide(
				groupUserId(2),
				f.groupId,
				f.caseId,
				p.id,
				{ planDigest: p.planDigest, reason: 'Withdraw support' },
				'CANCEL',
			),
		).toEqual({ id: p.id, status: 'CANCELLED' });
		expect(f.m.conflicts.state.decision).toHaveLength(1);
		expect(f.m.state.revisions).toHaveLength(2);
	});
	it.each([
		'membership',
		'credential',
		'role',
		'expiry',
		'new-author',
	] as const)(
		'fails closed when %s changes before final approval',
		async (kind) => {
			const p = await f.proposal();
			await approve(f, p.id, p.planDigest, 1);
			if (kind === 'membership')
				f.m.groups.state.memberships.find(
					(m) => m.expertId === f.a.authorExpertId,
				)!.joinedAt = new Date(Date.now() + 1);
			if (kind === 'credential')
				f.m.groups.state.experts[0].credentialSuspendedAt = new Date();
			if (kind === 'role') f.m.groups.state.experts[0].user.role = 'USER';
			if (kind === 'expiry') {
				const target = new Date(
					f.m.conflicts.state.proposal[0].expiresAt as Date,
				);
				jest.useFakeTimers({ now: target });
			}
			if (kind === 'new-author')
				await f.rules.create(
					groupUserId(3),
					f.groupId,
					validRuleContent(),
				);
			const before = structuredClone(f.m.state);
			try {
				await expect(
					approve(f, p.id, p.planDigest, 2),
				).rejects.toThrow();
				expect(f.m.state).toEqual(before);
				expect(f.m.conflicts.state.decision).toHaveLength(1);
			} finally {
				jest.useRealTimers();
			}
		},
	);
	it.each([
		'revision',
		'rule-audit',
		'notification',
		'reconciliation',
	] as const)(
		'rolls back final vote and all writes when %s persistence fails',
		async (step) => {
			const p = await f.proposal();
			await approve(f, p.id, p.planDigest, 1);
			const before = structuredClone({
				rules: f.m.state,
				workflow: f.m.conflicts.state,
			});
			if (step === 'revision')
				f.m.tx.ruleRevision.create.mockRejectedValueOnce(
					new Error('Synthetic failure'),
				);
			if (step === 'rule-audit')
				f.m.tx.ruleAudit.create.mockRejectedValueOnce(
					new Error('Synthetic failure'),
				);
			if (step === 'notification')
				f.m.tx.ruleConflictNotification.createMany.mockRejectedValueOnce(
					new Error('Synthetic failure'),
				);
			if (step === 'reconciliation')
				f.m.tx.ruleConflictAssessment.create.mockRejectedValueOnce(
					new Error('Synthetic failure'),
				);
			await expect(
				approve(f, p.id, p.planDigest, 2),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
			expect({ rules: f.m.state, workflow: f.m.conflicts.state }).toEqual(
				before,
			);
		},
	);
	it('serializes simultaneous required approvals and applies once', async () => {
		const p = await f.proposal();
		await Promise.all([
			approve(f, p.id, p.planDigest, 1),
			approve(f, p.id, p.planDigest, 2),
		]);
		expect(f.m.state.revisions).toHaveLength(3);
		expect(f.m.conflicts.state.decision).toHaveLength(2);
	});
	it('rejects plans that preserve the conflict or target rules outside its exact snapshot', async () => {
		const detail = await f.conflicts.detail(
			groupUserId(1),
			f.groupId,
			f.caseId,
		);
		const content = validRuleContent();
		content.conclusion.severity = 'SEVERE';
		await expect(
			f.resolutions.create(groupUserId(1), f.groupId, f.caseId, {
				expectedCaseStateHash: detail.stateHash,
				reason: 'Review',
				actions: [
					{
						ruleId: f.b.id,
						expectedRevisionId: detail.members.find(
							(m) => m.ruleId === f.b.id,
						)!.revisionId,
						type: 'REVISE',
						content,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			f.resolutions.create(groupUserId(1), f.groupId, f.caseId, {
				expectedCaseStateHash: detail.stateHash,
				reason: 'Review',
				actions: [
					{
						ruleId: 999,
						expectedRevisionId: detail.members[0].revisionId,
						type: 'ARCHIVE',
					},
				],
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('keeps notification ownership separate from group access', async () => {
		const q = new ConflictInboxQuery();
		const inbox = await f.conflicts.inbox(groupUserId(2), q);
		expect(Object.keys(inbox.items[0]).sort()).toEqual(
			[
				'id',
				'caseId',
				'proposalId',
				'type',
				'createdAt',
				'readAt',
			].sort(),
		);
		const id = inbox.items[0].id;
		await expect(f.conflicts.read(groupUserId(3), id)).rejects.toThrow();
		const first = await f.conflicts.read(groupUserId(2), id);
		expect(await f.conflicts.read(groupUserId(2), id)).toEqual(first);
		expect(
			(await f.conflicts.inbox(groupUserId(2), { ...q, read: 'unread' }))
				.items,
		).toHaveLength(0);
	});
	it('limits admin to minimal summaries and deduplicated 24-hour in-app reminders', async () => {
		f.m.groups.state.experts[6].user.role = 'ADMIN';
		const rows = await f.conflicts.adminList(
			groupUserId(7),
			new ConflictListQuery(),
		);
		expect(Object.keys(rows.items[0]).sort()).toEqual(
			[
				'category',
				'closedAt',
				'createdAt',
				'groupId',
				'id',
				'ruleCount',
				'status',
			].sort(),
		);
		const result = await f.conflicts.remind(groupUserId(7), f.caseId);
		expect(result.createdCount).toBe(2);
		await expect(
			f.conflicts.remind(groupUserId(7), f.caseId),
		).rejects.toMatchObject({ status: 429 });
	});
	it('does not treat pending resolution, cached clear, or an empty ruleset as calculation readiness', async () => {
		await f.proposal();
		await expect(
			f.assessment.readCurrentConflictFreeSnapshot(f.groupId),
		).rejects.toBeInstanceOf(ConflictException);
		const result = await f.assessment.privateAssessment(
			groupUserId(1),
			f.groupId,
		);
		expect(result.applicableStatus).toBe('CONFLICTED');
		f.m.state.rules.forEach((r) => (r.archivedAt = new Date()));
		await expect(
			f.assessment.readCurrentConflictFreeSnapshot(f.groupId),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('excludes ineligible authors before decoding applicable rules, without waiving governance conflicts', async () => {
		f.m.groups.state.experts[1].profileValidatedAt = null;
		expect(
			(
				await f.assessment.readCurrentConflictFreeSnapshot(f.groupId)
			).rules.map((r) => r.id),
		).toEqual([f.a.id]);
		const p = await f.proposal();
		expect(p.participants).toHaveLength(2);
	});
	it('counts one author once across multiple conflicting rules and supports archive-only correction', async () => {
		const s = conflictServices();
		const group = s.m.groups.seedGroup([1]);
		const a = await s.rules.create(
			groupUserId(1),
			group,
			validRuleContent(),
		);
		const content = validRuleContent();
		content.conclusion.severity = 'MILD';
		const b = await s.rules.create(groupUserId(1), group, content);
		const caseId = s.m.conflicts.state.case[0].id;
		const detail = await s.conflicts.detail(groupUserId(1), group, caseId);
		const p = await s.resolutions.create(groupUserId(1), group, caseId, {
			expectedCaseStateHash: detail.stateHash,
			reason: 'Withdraw contradictory duplicate',
			actions: [
				{
					ruleId: b.id,
					expectedRevisionId: detail.members.find(
						(m) => m.ruleId === b.id,
					)!.revisionId,
					type: 'ARCHIVE',
				},
			],
		});
		expect(p.participants).toHaveLength(1);
		expect(
			(
				await s.resolutions.decide(
					groupUserId(1),
					group,
					caseId,
					p.id,
					{ planDigest: p.planDigest },
					'APPROVE',
				)
			).status,
		).toBe('APPLIED');
		expect(
			s.m.state.rules.find((r) => r.id === a.id)!.archivedAt,
		).toBeNull();
		expect(
			s.m.state.rules.find((r) => r.id === b.id)!.archivedAt,
		).not.toBeNull();
		expect(s.m.state.revisions).toHaveLength(2);
	});
	it('requires every author of the conflict, including multiple unchanged counterparts', async () => {
		await f.rules.create(groupUserId(3), f.groupId, validRuleContent());
		const newCase = f.m.conflicts.state.case.find(
			(c) => c.status === 'OPEN',
		)!;
		const detail = await f.conflicts.detail(
			groupUserId(1),
			f.groupId,
			newCase.id,
		);
		const p = await f.resolutions.create(
			groupUserId(1),
			f.groupId,
			newCase.id,
			{
				expectedCaseStateHash: detail.stateHash,
				reason: 'Align outcomes',
				actions: [
					{
						ruleId: f.b.id,
						expectedRevisionId: detail.members.find(
							(m) => m.ruleId === f.b.id,
						)!.revisionId,
						type: 'REVISE',
						content: validRuleContent(),
					},
				],
			},
		);
		expect(p.participants).toHaveLength(3);
		for (const n of [1, 2])
			expect(
				(
					await f.resolutions.decide(
						groupUserId(n),
						f.groupId,
						newCase.id,
						p.id,
						{ planDigest: p.planDigest },
						'APPROVE',
					)
				).status,
			).toBe('PENDING');
		expect(
			(
				await f.resolutions.decide(
					groupUserId(3),
					f.groupId,
					newCase.id,
					p.id,
					{ planDigest: p.planDigest },
					'APPROVE',
				)
			).status,
		).toBe('APPLIED');
	});
	it('does not decode an excluded corrupt rule in the internal consumption boundary', async () => {
		f.m.groups.state.experts[1].profileValidatedAt = null;
		f.m.state.revisions.find((r) => r.ruleId === f.b.id)!.originalPayload =
			{ corrupt: true };
		expect(
			(
				await f.assessment.readCurrentConflictFreeSnapshot(f.groupId)
			).rules.map((r) => r.id),
		).toEqual([f.a.id]);
		f.m.groups.state.experts[1].profileValidatedAt = new Date();
		await expect(
			f.assessment.readCurrentConflictFreeSnapshot(f.groupId),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('uses caller transaction directly for current rules and reference checks', async () => {
		f.m.groups.state.experts[1].profileValidatedAt = null;
		f.m.transaction.mockClear();
		const result = await f.assessment.readCurrentConflictFreeSnapshot(
			f.groupId,
			f.m.tx as unknown as Parameters<typeof f.core.snapshot>[0],
		);
		expect(result.rules).toHaveLength(1);
		expect(f.m.transaction).not.toHaveBeenCalled();
	});
	it('makes case/group scope and departed membership mandatory for all shared details', async () => {
		const p = await f.proposal();
		const other = f.m.groups.seedGroup([1]);
		await expect(
			f.resolutions.detail(groupUserId(1), other, f.caseId, p.id),
		).rejects.toThrow();
		f.m.groups.state.memberships.find(
			(m) => m.expertId === f.a.authorExpertId && m.groupId === f.groupId,
		)!.status = 'LEFT';
		await expect(
			f.resolutions.detail(groupUserId(1), f.groupId, f.caseId, p.id),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			f.conflicts.detail(groupUserId(1), f.groupId, f.caseId),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it.each(['plan', 'action', 'participant', 'decision'] as const)(
		'fails closed on altered immutable %s evidence',
		async (kind) => {
			const p = await f.proposal();
			if (kind === 'plan')
				f.m.conflicts.state.proposal[0].reason = 'Tampered';
			if (kind === 'action')
				f.m.conflicts.state.action[0].revisionId = 'other';
			if (kind === 'participant') f.m.conflicts.state.participant.pop();
			if (kind === 'decision') {
				await approve(f, p.id, p.planDigest, 1);
				f.m.conflicts.state.decision[0].planDigest = 'f'.repeat(64);
			}
			await expect(
				f.resolutions.detail(groupUserId(1), f.groupId, f.caseId, p.id),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
	it('allows a fresh proposal after exact-boundary expiry without altering old consent', async () => {
		const p = await f.proposal();
		await approve(f, p.id, p.planDigest, 1);
		jest.useFakeTimers({ now: new Date(p.expiresAt) });
		try {
			const next = await f.proposal();
			expect(next.id).not.toBe(p.id);
			expect(
				f.m.conflicts.state.proposal.find((r) => r.id === p.id)!.status,
			).toBe('EXPIRED');
			expect(f.m.conflicts.state.decision).toHaveLength(1);
			expect(next.participants.every((r) => r.decision === null)).toBe(
				true,
			);
		} finally {
			jest.useRealTimers();
		}
	});
	it('serializes cancellation against final approval and never applies a cancelled plan', async () => {
		const p = await f.proposal();
		await approve(f, p.id, p.planDigest, 1);
		const results = await Promise.allSettled([
			f.resolutions.decide(
				groupUserId(1),
				f.groupId,
				f.caseId,
				p.id,
				{ planDigest: p.planDigest, reason: 'Withdraw' },
				'CANCEL',
			),
			approve(f, p.id, p.planDigest, 2),
		]);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
		expect(f.m.state.revisions).toHaveLength(2);
	});
	it('locks required users in sorted order before group and rule rows, without touching group updatedAt', async () => {
		const p = await f.proposal();
		f.m.tx.$queryRaw.mockClear();
		const before = structuredClone(f.m.groups.state.groups);
		await approve(f, p.id, p.planDigest, 1);
		const calls = f.m.tx.$queryRaw.mock.calls as unknown as [
			TemplateStringsArray,
			...unknown[],
		][];
		expect(calls.slice(0, 2).map((c) => c[1])).toEqual(
			[groupUserId(1), groupUserId(2)].sort(),
		);
		expect(calls[2][0].join('')).toContain('FROM "Group"');
		expect(calls[3][0].join('')).toContain('FROM "Rule"');
		expect(f.m.groups.state.groups).toEqual(before);
	});
});
