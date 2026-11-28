import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { RulesService } from './rules.service';
import { RuleRevisionStore } from './rule-revision-store.service';
import { RuleConflictCoreService } from './conflicts/rule-conflict-core.service';
import { RuleReferenceService } from './rule-reference.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { CredentialEligibilityService } from '../credentials/credential-eligibility.service';
import { createRulesMocks, validRuleContent } from '../../../test/rules-mocks';
import { groupUserId } from '../../../test/groups-mocks';
import {
	RulesPageQuery,
	RulesQuery,
} from '../../api/common/dto/rules/rule-requests.dto';

describe('DASS42 authored revisions (synthetic persistence)', () => {
	let m: ReturnType<typeof createRulesMocks>;
	let service: RulesService;
	let groupId: number;
	const user = groupUserId(1);
	beforeEach(() => {
		m = createRulesMocks();
		groupId = m.groups.seedGroup([1, 2]);
		service = new RulesService(
			m.prisma,
			new CredentialEligibilityService(m.prisma),
			new RuleReferenceService(new ReferenceDataService(m.prisma)),
			new RuleRevisionStore(),
			new RuleConflictCoreService(new RuleRevisionStore()),
		);
	});
	const create = () => service.create(user, groupId, validRuleContent());
	it('should author cross-category rules in a non-public group before QDSS profile/factors/preferences are complete', async () => {
		Object.assign(m.groups.state.experts[0], {
			profileValidatedAt: null,
			profileVersion: 0,
			weight: null,
			preferences: [],
		});
		const g = structuredClone(m.groups.state.groups);
		const rule = await create();
		expect(rule.content).toEqual(validRuleContent());
		expect(rule.version).toBe(1);
		expect(m.state.audits[0].action).toBe('CREATED');
		expect(m.groups.state.groups).toEqual(g);
	});
	it('should allow many rules by one author in one or multiple groups', async () => {
		await create();
		await create();
		groupId = m.groups.seedGroup([1]);
		await create();
		expect(m.state.rules).toHaveLength(3);
	});
	it.each([
		'role',
		'email',
		'suspension',
		'expiry',
		'membership',
		'group',
	] as const)('should reject authoring with invalid %s', async (kind) => {
		const e = m.groups.state.experts[0];
		if (kind === 'role') e.user.role = 'USER';
		if (kind === 'email') e.user.emailVerifiedAt = null;
		if (kind === 'suspension') e.credentialSuspendedAt = new Date();
		if (kind === 'expiry') e.credentialRevisions[0].expiresAt = new Date();
		if (kind === 'membership')
			m.groups.state.memberships[0].status = 'LEFT';
		if (kind === 'group') m.groups.state.groups[0].archivedAt = new Date();
		await expect(create()).rejects.toThrow();
		expect(m.state.rules).toHaveLength(0);
	});
	it('should let members read other authors but reject their updates/archive even if leader', async () => {
		const r = await service.create(
			groupUserId(2),
			groupId,
			validRuleContent(),
		);
		expect((await service.detail(user, groupId, r.id)).authorExpertId).toBe(
			r.authorExpertId,
		);
		await expect(
			service.update(user, groupId, r.id, {
				...validRuleContent(),
				expectedStateHash: r.stateHash,
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.archive(user, groupId, r.id, {
				expectedStateHash: r.stateHash,
				reason: 'Reason',
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should preserve owner historical reads after removal and deny others outside the group', async () => {
		const r = await create();
		m.groups.state.memberships[0].status = 'REMOVED';
		expect((await service.detail(user, groupId, r.id)).id).toBe(r.id);
		expect((await service.mine(user, new RulesQuery())).items).toHaveLength(
			1,
		);
		await expect(
			service.detail(groupUserId(3), groupId, r.id),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.update(user, groupId, r.id, {
				...validRuleContent(),
				expectedStateHash: r.stateHash,
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should reject a rule ID through another group even when owner belongs to both', async () => {
		const r = await create();
		const other = m.groups.seedGroup([1]);
		await expect(service.detail(user, other, r.id)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
	it('should append immutable full revisions and reject stale comparison states', async () => {
		const r = await create();
		const first = structuredClone(m.state.revisions[0]);
		const content = validRuleContent();
		content.conclusion.severity = 'SEVERE';
		const changed = await service.update(user, groupId, r.id, {
			...content,
			expectedStateHash: r.stateHash,
		});
		expect(changed.version).toBe(2);
		expect(m.state.revisions[0]).toEqual(first);
		await expect(
			service.update(user, groupId, r.id, {
				...content,
				expectedStateHash: r.stateHash,
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect(
			(await service.revisionDetail(user, groupId, r.id, 1)).content,
		).toEqual(validRuleContent());
		expect(
			(
				await service.revisions(
					user,
					groupId,
					r.id,
					new RulesPageQuery(),
				)
			).items.map((x) => x.version),
		).toEqual([2, 1]);
	});
	it('should not create fake revisions/audit/timestamps for authorized no-op content', async () => {
		const r = await create();
		const before = structuredClone(m.state);
		expect(
			(
				await service.update(user, groupId, r.id, {
					...validRuleContent(),
					expectedStateHash: r.stateHash,
				})
			).version,
		).toBe(1);
		expect(m.state).toEqual(before);
	});
	it('should serialize simulated simultaneous full edits into one revision and one conflict', async () => {
		const r = await create();
		const c = validRuleContent();
		c.conclusion.severity = 'SEVERE';
		const results = await Promise.allSettled([
			service.update(user, groupId, r.id, {
				...c,
				expectedStateHash: r.stateHash,
			}),
			service.update(user, groupId, r.id, {
				...c,
				expectedStateHash: r.stateHash,
			}),
		]);
		expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
		expect(m.state.revisions).toHaveLength(2);
	});
	it.each(['revision', 'audit', 'readback'] as const)(
		'should roll back the whole create when %s fails',
		async (kind) => {
			if (kind === 'revision')
				m.tx.ruleRevision.create.mockRejectedValueOnce(
					new Error('private detail'),
				);
			if (kind === 'audit')
				m.tx.ruleAudit.create.mockRejectedValueOnce(
					new Error('private detail'),
				);
			if (kind === 'readback')
				m.tx.rule.findUnique.mockResolvedValueOnce(null);
			await expect(create()).rejects.toThrow();
			expect(m.state.rules).toHaveLength(0);
			expect(m.state.revisions).toHaveLength(0);
			expect(m.state.audits).toHaveLength(0);
		},
	);
	it('should restore earlier head/content when revision audit fails', async () => {
		const r = await create();
		const before = structuredClone(m.state);
		const c = validRuleContent();
		c.conclusion.severity = 'SEVERE';
		m.tx.ruleAudit.create.mockRejectedValueOnce(new Error('fail'));
		await expect(
			service.update(user, groupId, r.id, {
				...c,
				expectedStateHash: r.stateHash,
			}),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(m.state).toEqual(before);
	});
	it.each([
		'ast',
		'hash',
		'position',
		'original',
		'version',
		'conclusion',
	] as const)(
		'should fail closed on corrupt latest %s instead of falling back',
		async (kind) => {
			const r = await create();
			const row = m.state.revisions[0];
			if (kind === 'ast') row.canonicalAntecedent = [];
			if (kind === 'hash') row.antecedentHash = '0'.repeat(64);
			if (kind === 'position') row.premises[0].position = 3;
			if (kind === 'original') row.originalPayload = {};
			if (kind === 'version') row.version = 0;
			if (kind === 'conclusion') row.conclusion.severity = 'NORMAL';
			await expect(
				service.detail(user, groupId, r.id),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
	it('should archive with owner reason while preserving old content and rejecting later writes', async () => {
		const r = await create();
		const revisions = structuredClone(m.state.revisions);
		const archived = await service.archive(user, groupId, r.id, {
			expectedStateHash: r.stateHash,
			reason: 'Professional withdrawal',
		});
		expect(archived.archivedAt).not.toBeNull();
		expect(m.state.revisions).toEqual(revisions);
		expect(m.state.audits.at(-1)?.reason).toBe('Professional withdrawal');
		expect(
			(await service.list(user, groupId, new RulesQuery())).items,
		).toHaveLength(0);
		await expect(
			service.update(user, groupId, r.id, {
				...validRuleContent(),
				expectedStateHash: archived.stateHash,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should not require current catalog availability for own historical reading/withdrawal', async () => {
		const r = await create();
		m.tx.dASS42.findMany.mockRejectedValue(new Error('unavailable'));
		expect((await service.detail(user, groupId, r.id)).id).toBe(r.id);
		await service.archive(user, groupId, r.id, {
			expectedStateHash: r.stateHash,
			reason: 'Withdrawal',
		});
	});
	it('should filter current revision categories before pagination, never an old matching category', async () => {
		const old = await create();
		const c = validRuleContent();
		c.conclusion.category = 'STRESS';
		await service.update(user, groupId, old.id, {
			...c,
			expectedStateHash: old.stateHash,
		});
		const a = await create();
		const b = await create();
		const q = {
			...new RulesQuery(),
			category: 'DEPRESSION' as const,
			limit: 1,
		};
		const first = await service.list(user, groupId, q);
		const second = await service.list(user, groupId, { ...q, page: 2 });
		expect(new Set([first.items[0].id, second.items[0].id])).toEqual(
			new Set([a.id, b.id]),
		);
		expect(first.hasNext).toBe(true);
		expect(second.hasNext).toBe(false);
	});
	it('should return 409 for reference release changes and 503 for missing declared conclusion/catalog', async () => {
		await expect(
			service.create(user, groupId, {
				...validRuleContent(),
				catalogVersion: 'stale',
			}),
		).rejects.toBeInstanceOf(ConflictException);
		m.state.conclusions = [];
		await expect(create()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(m.state.rules).toHaveLength(0);
	});
	it('should recheck current role and credentials, while allowing expired-member reads', async () => {
		const r = await create();
		m.groups.state.experts[0].credentialSuspendedAt = new Date();
		expect((await service.detail(user, groupId, r.id)).id).toBe(r.id);
		await expect(
			service.archive(user, groupId, r.id, {
				expectedStateHash: r.stateHash,
				reason: 'Reason',
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		m.groups.state.experts[0].user.role = 'ADMIN';
		await expect(
			service.detail(user, groupId, r.id),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should lock User then Group then Rule and never touch Group.updatedAt', async () => {
		const r = await create();
		m.tx.$queryRaw.mockClear();
		await service.update(user, groupId, r.id, {
			...validRuleContent(),
			expectedStateHash: r.stateHash,
		});
		const calls = m.tx.$queryRaw.mock.calls as unknown as [
			TemplateStringsArray,
			...unknown[],
		][];
		expect(calls.map((c) => c[0].join(''))).toEqual([
			expect.stringContaining('FROM "User"'),
			expect.stringContaining('FROM "Group"'),
			expect.stringContaining('FROM "Rule"'),
		]);
		expect(m.groups.tx.group.update).not.toHaveBeenCalled();
	});
	it('should scan beyond invalid category candidates without returning a falsely empty filtered page', async () => {
		const other = validRuleContent();
		other.conclusion.category = 'STRESS';
		for (let i = 0; i < 101; i++)
			await service.create(user, groupId, other);
		const valid = await create();
		for (const row of m.state.rules)
			row.updatedAt = new Date(
				row.id === valid.id ? '2020-01-01' : '2026-01-01',
			);
		m.tx.rule.findMany.mockClear();
		const result = await service.list(user, groupId, {
			...new RulesQuery(),
			category: 'DEPRESSION',
		});
		expect(result.items.map((r) => r.id)).toEqual([valid.id]);
		expect(result.hasNext).toBe(false);
		expect(m.tx.rule.findMany).toHaveBeenCalledTimes(2);
	});
	it('should map serialization/unique failures to 409 and keep archive rollback atomic', async () => {
		const r = await create();
		const before = structuredClone(m.state);
		m.tx.ruleAudit.create.mockRejectedValueOnce(
			Object.assign(new Error('private'), { code: 'P2034' }),
		);
		await expect(
			service.archive(user, groupId, r.id, {
				expectedStateHash: r.stateHash,
				reason: 'Reason',
			}),
		).rejects.toBeInstanceOf(ConflictException);
		expect(m.state).toEqual(before);
	});
});
