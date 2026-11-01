import {
	ForbiddenException,
	ConflictException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import {
	GroupEligibilityService,
	ELIGIBILITY_EXPERT_SELECT,
} from './group-eligibility.service';
import { ExpertProfileCompletenessService } from '../expert/expert-profile-completeness.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import {
	createGroupsMocks,
	groupExpertId,
	groupUserId,
} from '../../test/groups-mocks';
import { PublicGroupQuery } from './dto/group-requests.dto';
import type { Prisma } from '../prisma/generated/client';

describe('Current group eligibility and public catalog', () => {
	let m: ReturnType<typeof createGroupsMocks>;
	let service: GroupEligibilityService;
	let profiles: ExpertProfileCompletenessService;
	let id: number;
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-10-30'));
		m = createGroupsMocks();
		profiles = new ExpertProfileCompletenessService();
		service = new GroupEligibilityService(
			m.prisma,
			new ReferenceDataService(m.prisma),
			profiles,
		);
		id = m.seedGroup([1, 2, 3, 4]);
	});
	afterEach(() => jest.useRealTimers());
	it('should publish exactly four valid distinct experts with no session/online requirement', async () => {
		const group = await service.publicDetail(id);
		expect(group.activeMemberCount).toBe(4);
		expect(group.validExpertCount).toBe(4);
		expect(m.tx.dASS21.findMany).toHaveBeenCalledTimes(1);
	});
	const invalidators: [
		string,
		(
			e: ReturnType<typeof createGroupsMocks>['state']['experts'][number],
		) => void,
	][] = [
		[
			'wrong role',
			(e) => {
				e.user.role = 'USER';
			},
		],
		[
			'unverified email',
			(e) => {
				e.user.email_verified_at = null;
			},
		],
		[
			'suspension',
			(e) => {
				e.credentialSuspendedAt = new Date();
			},
		],
		[
			'STR expiry',
			(e) => {
				e.credentialRevisions.find((r) => r.type === 'STR')!.expiresAt =
					new Date();
			},
		],
		[
			'SIP expiry',
			(e) => {
				e.credentialRevisions.find((r) => r.type === 'SIP')!.expiresAt =
					new Date();
			},
		],
		[
			'duplicate approval',
			(e) => {
				e.credentialRevisions.push({ ...e.credentialRevisions[0] });
			},
		],
		[
			'missing approval',
			(e) => {
				e.credentialRevisions = [];
			},
		],
		[
			'holder mismatch',
			(e) => {
				e.user.name = 'Changed';
			},
		],
		[
			'unsubmitted profile',
			(e) => {
				e.profileValidatedAt = null;
			},
		],
		[
			'missing capability',
			(e) => {
				e.clinicalHours = null;
			},
		],
		[
			'invalid capability',
			(e) => {
				e.patientsNumber = -1;
			},
		],
		[
			'missing weights',
			(e) => {
				e.weight = null;
			},
		],
		[
			'wrong factor total',
			(e) => {
				e.weight!.educationWeight = 0;
			},
		],
		[
			'fractional factor',
			(e) => {
				e.weight!.educationWeight = 25.5;
			},
		],
		[
			'incomplete preferences',
			(e) => {
				e.preferences.pop();
			},
		],
		[
			'wrong per-question sum',
			(e) => {
				e.preferences[0].percentStress = 24;
			},
		],
		[
			'fractional preference',
			(e) => {
				e.preferences[0].percentStress = 25.5;
			},
		],
		[
			'duplicate question',
			(e) => {
				e.preferences[20] = { ...e.preferences[0] };
			},
		],
		[
			'stale catalog provenance',
			(e) => {
				e.preferences[0].catalogVersion = 'older-release';
			},
		],
		[
			'malformed stored version',
			(e) => {
				e.preferences[0].catalogVersion = '';
			},
		],
		[
			'foreign question',
			(e) => {
				e.preferences[0].dass21Id = 'DASS42-Q01';
			},
		],
	];
	it.each(invalidators)(
		'should exclude one invalid member (%s), hiding a four-member group',
		async (_label, invalidate) => {
			invalidate(m.state.experts[0]);
			await expect(service.publicDetail(id)).rejects.toBeInstanceOf(
				NotFoundException,
			);
			const state = await service.privateAssessment(groupUserId(2), id);
			expect(state.validExpertCount).toBe(3);
			expect(
				state.members.find((m) => m.expertId === groupExpertId(1))!
					.eligible,
			).toBe(false);
			expect(state.eligible).toBe(false);
		},
	);
	it('should keep five-member group public with four valid contributors even if leader is invalid', async () => {
		id = m.seedGroup([1, 2, 3, 4, 5]);
		m.state.experts[0].credentialSuspendedAt = new Date();
		const state = await service.publicDetail(id);
		expect(state.validExpertCount).toBe(4);
		expect(state.activeMemberCount).toBe(5);
	});
	it('should withdraw at exact credential expiry on a new read without cached flags or cron', async () => {
		const expiry = new Date(Date.now() + 1000);
		m.state.experts[0].credentialRevisions[0].expiresAt = expiry;
		await service.publicDetail(id);
		jest.setSystemTime(expiry);
		await expect(service.publicDetail(id)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
	it('should exclude inactive memberships and archived groups', async () => {
		id = m.seedGroup([1, 2, 3, 4, 5]);
		const row = m.state.memberships.find(
			(m) => m.groupId === id && m.expertId === groupExpertId(5),
		)!;
		Object.assign(row, { status: 'LEFT', leftAt: new Date() });
		expect((await service.publicDetail(id)).activeMemberCount).toBe(4);
		m.state.groups.find((g) => g.id === id)!.archivedAt = new Date();
		await expect(service.publicDetail(id)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
	it('should filter all candidates before final pagination, including eligible groups after many invalid candidates', async () => {
		m.state.groups = [];
		m.state.memberships = [];
		for (let i = 0; i < 25; i++) m.seedGroup([1, 2, 3]);
		const valid = [
			m.seedGroup([1, 2, 3, 4]),
			m.seedGroup([2, 3, 4, 5]),
			m.seedGroup([3, 4, 5, 6]),
		];
		const q = {
			...new PublicGroupQuery(),
			limit: 2,
			sort: 'memberCount' as const,
			order: 'asc' as const,
		};
		const first = await service.list(q);
		const second = await service.list({ ...q, page: 2 });
		expect(first.items.map((g) => g.id)).toEqual(valid.slice(0, 2));
		expect(first.hasNext).toBe(true);
		expect(second.items.map((g) => g.id)).toEqual(valid.slice(2));
		expect(second.hasNext).toBe(false);
		expect(first).not.toHaveProperty('total');
	});
	it('should sort memberCount by active rather than valid/historical/invited counts and tie by group ID', async () => {
		const five = m.seedGroup([1, 2, 3, 4, 5]);
		const six = m.seedGroup([1, 2, 3, 4, 5, 6]);
		const inactive = m.state.memberships.find(
			(m) => m.groupId === six && m.expertId === groupExpertId(6),
		)!;
		Object.assign(inactive, { status: 'REMOVED', leftAt: new Date() });
		const q = { ...new PublicGroupQuery(), sort: 'memberCount' as const };
		expect((await service.list(q)).items.map((g) => g.id)).toEqual([
			five,
			six,
			id,
		]);
		expect(
			(await service.list({ ...q, order: 'asc' })).items.map((g) => g.id),
		).toEqual([id, five, six]);
	});
	it('should sort updatedAt consistently in both directions', async () => {
		const newer = m.seedGroup([1, 2, 3, 4]);
		m.state.groups.find((g) => g.id === newer)!.updatedAt = new Date();
		const q = new PublicGroupQuery();
		expect((await service.list(q)).items.map((g) => g.id)).toEqual([
			newer,
			id,
		]);
		expect(
			(await service.list({ ...q, order: 'asc' })).items.map((g) => g.id),
		).toEqual([id, newer]);
	});
	it('should load one validated catalog and memoize shared experts per request', async () => {
		m.seedGroup([1, 2, 3, 4]);
		m.seedGroup([2, 3, 4, 5]);
		const spy = jest.spyOn(profiles, 'evaluate');
		await service.list(new PublicGroupQuery());
		expect(spy).toHaveBeenCalledTimes(5);
		expect(m.tx.dASS21.findMany).toHaveBeenCalledTimes(1);
		expect(m.tx.expert.findUnique).not.toHaveBeenCalled();
	});
	it('should return explicit safe failure instead of empty success on catalog or persistence failure', async () => {
		m.tx.dASS21.findMany.mockRejectedValueOnce(
			new Error('secret connection detail'),
		);
		await expect(
			service.list(new PublicGroupQuery()),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		m.tx.group.findMany.mockRejectedValueOnce(
			new Error('secret connection detail'),
		);
		await expect(service.list(new PublicGroupQuery())).rejects.toThrow(
			'Group persistence unavailable',
		);
	});
	it('should not expose membership identities, credential/profile/preference details, usage counts or readiness claims publicly', async () => {
		const group = await service.publicDetail(id);
		expect(Object.keys(group).sort()).toEqual(
			[
				'id',
				'name',
				'description',
				'activeMemberCount',
				'validExpertCount',
				'createdAt',
				'updatedAt',
			].sort(),
		);
		expect(ELIGIBILITY_EXPERT_SELECT).not.toHaveProperty('documents');
		expect(ELIGIBILITY_EXPERT_SELECT.user.select).not.toHaveProperty(
			'email',
		);
		expect(ELIGIBILITY_EXPERT_SELECT.user.select).not.toHaveProperty(
			'password',
		);
		expect(
			ELIGIBILITY_EXPERT_SELECT.credentialRevisions.select,
		).not.toHaveProperty('numberCipher');
		expect(
			ELIGIBILITY_EXPERT_SELECT.credentialRevisions.select,
		).not.toHaveProperty('objectKey');
	});
	it('should restrict private assessment to current expert members and disclose boolean validity only', async () => {
		await expect(
			service.privateAssessment(groupUserId(7), id),
		).rejects.toBeInstanceOf(ForbiddenException);
		m.state.experts[1].user.role = 'ADMIN';
		await expect(
			service.privateAssessment(groupUserId(2), id),
		).rejects.toBeInstanceOf(ForbiddenException);
		const result = await service.privateAssessment(groupUserId(1), id);
		expect(Object.keys(result.members[0]).sort()).toEqual(
			['expertId', 'isSelf', 'eligible'].sort(),
		);
	});
	it('should never change Group metadata during eligibility reads', async () => {
		const before = structuredClone(m.state);
		await service.list(new PublicGroupQuery());
		await service.publicDetail(id);
		await service.privateAssessment(groupUserId(1), id);
		expect(m.state).toEqual(before);
		expect(m.tx.group.update).not.toHaveBeenCalled();
	});
	it('should provide current valid contributor identities internally without accepting an earlier catalog selection as authorization', async () => {
		id = m.seedGroup([1, 2, 3, 4, 5]);
		m.state.experts[0].credentialSuspendedAt = new Date();
		expect((await service.requireCurrent(id)).validExpertIds).toEqual(
			[2, 3, 4, 5].map(groupExpertId),
		);
		m.state.experts[1].credentialSuspendedAt = new Date();
		await expect(service.requireCurrent(id)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});
	it('should honor the evaluation caller transaction instead of starting a separate snapshot', async () => {
		const result = await service.requireCurrent(
			id,
			m.tx as unknown as Prisma.TransactionClient,
		);
		expect(result.validExpertIds).toHaveLength(4);
		expect(m.transaction).not.toHaveBeenCalled();
		expect(m.tx.dASS21.findMany).toHaveBeenCalledTimes(1);
	});
	it('should reject missing and archived groups at the internal evaluation boundary', async () => {
		await expect(service.requireCurrent(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
		m.state.groups[0].archivedAt = new Date();
		await expect(service.requireCurrent(id)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});
});
