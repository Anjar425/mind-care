import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { GroupsService } from './groups.service';
import { groupStateHash } from './group-policy';
import {
	createGroupsMocks,
	groupExpertId,
	groupUserId,
} from '../../test/groups-mocks';
import { GroupPageQuery } from './dto/group-requests.dto';

describe('Group governance (synthetic transactional persistence)', () => {
	let m: ReturnType<typeof createGroupsMocks>;
	let service: GroupsService;
	let id: number;
	const user = groupUserId(1);
	const target = groupUserId(2);
	const metadata = {
		name: ' Example group ',
		description: 'Visible professional group description',
	};
	const current = () =>
		m.snapshotGroup(m.state.groups.find((g) => g.id === id)!);
	const state = () => ({ expectedStateHash: groupStateHash(current()) });
	const invite = () =>
		service.invite(user, id, { ...state(), recipientUserId: target });
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-10-30T00:00:00Z'));
		m = createGroupsMocks();
		id = m.seedGroup([1, 2]);
		service = new GroupsService(
			m.prisma,
			new CredentialEligibilityService(m.prisma),
		);
	});
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});
	it('should create one founder/leader without profile, factors, preferences or catalog readiness', async () => {
		Object.assign(m.state.experts[0], {
			profileVersion: 0,
			profileValidatedAt: null,
			weight: null,
			preferences: [],
			education: null,
		});
		m.tx.dASS21.findMany.mockRejectedValue(new Error('unavailable'));
		const g = await service.create(user, metadata);
		expect(g.ownRole).toBe('LEADER');
		expect(g.name).toBe(metadata.name);
		expect(g.members).toHaveLength(1);
		expect(
			m.state.audits
				.filter((a) => a.groupId === g.id)
				.map((a) => a.action),
		).toEqual(['CREATED']);
		expect(m.tx.dASS21.findMany).not.toHaveBeenCalled();
	});
	it.each(['role', 'email', 'suspension', 'STR', 'SIP', 'name'] as const)(
		'should reject create for invalid %s',
		async (kind) => {
			const e = m.state.experts[0];
			if (kind === 'role') e.user.role = 'USER';
			if (kind === 'email') e.user.email_verified_at = null;
			if (kind === 'suspension') e.credentialSuspendedAt = new Date();
			if (kind === 'STR' || kind === 'SIP')
				e.credentialRevisions.find((r) => r.type === kind)!.expiresAt =
					new Date();
			if (kind === 'name') e.user.name = 'Changed name';
			await expect(service.create(user, metadata)).rejects.toBeInstanceOf(
				ForbiddenException,
			);
			expect(m.state.groups).toHaveLength(1);
		},
	);
	it('should roll back group, membership and audit together on audit failure', async () => {
		m.tx.groupAudit.create.mockRejectedValueOnce(
			new Error('private persistence detail'),
		);
		await expect(service.create(user, metadata)).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(m.state.groups).toHaveLength(1);
		expect(m.state.memberships).toHaveLength(2);
		expect(m.state.audits).toHaveLength(0);
	});
	it('should keep expired-owner private metadata readable and exclude nonmembers', async () => {
		m.state.experts[0].credentialSuspendedAt = new Date();
		expect((await service.detail(user, id)).ownRole).toBe('LEADER');
		await expect(service.detail(groupUserId(3), id)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		await expect(service.detail(user, 999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
	it('should list multiple own memberships without creating or updating rows', async () => {
		m.seedGroup([3, 1]);
		const list = await service.mine(user, new GroupPageQuery());
		expect(list.items).toHaveLength(2);
		expect(m.tx.group.update).not.toHaveBeenCalled();
	});
	it('should reject stale metadata and avoid touching no-op metadata', async () => {
		const before = current();
		await service.update(user, id, {
			...state(),
			name: before.name,
			description: before.description,
		});
		expect(m.tx.group.update).not.toHaveBeenCalled();
		await service.update(user, id, { ...state(), ...metadata });
		await expect(
			service.update(user, id, {
				expectedStateHash: groupStateHash(before),
				...metadata,
			}),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should reject ordinary-member metadata, invite, removal and archive authority', async () => {
		await expect(
			service.update(target, id, { ...state(), ...metadata }),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.invite(target, id, {
				...state(),
				recipientUserId: groupUserId(3),
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.remove(target, id, groupExpertId(1), {
				...state(),
				reason: 'Reason',
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.archive(target, id, { ...state(), reason: 'Reason' }),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should issue no membership and no Group.updatedAt change until recipient acceptance', async () => {
		id = m.seedGroup([1]);
		const before = current().updatedAt;
		const grant = await invite();
		expect(grant.status).toBe('PENDING');
		expect(current().memberships).toHaveLength(1);
		expect(current().updatedAt).toEqual(before);
		expect(grant.expiresAt.getTime() - grant.createdAt.getTime()).toBe(
			7 * 86400000,
		);
		await expect(
			service.decideInvitation(groupUserId(3), grant.id, true),
		).rejects.toBeInstanceOf(NotFoundException);
		Object.assign(m.state.experts[1], {
			profileVersion: 0,
			profileValidatedAt: null,
			weight: null,
			preferences: [],
		});
		expect(
			(await service.decideInvitation(target, grant.id, true)).status,
		).toBe('ACCEPTED');
		expect(current().updatedAt.getTime()).toBeGreaterThan(before.getTime());
		expect(current().memberships).toHaveLength(2);
	});
	it('should require current credentials at acceptance and keep pending on failed acceptance', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		m.state.experts[1].credentialRevisions[0].expiresAt = new Date();
		await expect(
			service.decideInvitation(target, grant.id, true),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(m.state.invitations[0].status).toBe('PENDING');
		expect(current().memberships).toHaveLength(1);
	});
	it('should allow exact recipient decline with expired credentials and no metadata touch', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		m.state.experts[1].credentialSuspendedAt = new Date();
		const before = current().updatedAt;
		expect(
			(await service.decideInvitation(target, grant.id, false)).status,
		).toBe('DECLINED');
		expect(current().updatedAt).toEqual(before);
		expect(current().memberships).toHaveLength(1);
	});
	it('should expire at the exact boundary without a scheduler or write on inbox read', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		jest.setSystemTime(grant.expiresAt);
		expect(
			(await service.invitations(target, new GroupPageQuery())).items[0]
				.status,
		).toBe('EXPIRED');
		expect(m.state.invitations[0].status).toBe('PENDING');
		await expect(
			service.decideInvitation(target, grant.id, true),
		).rejects.toBeInstanceOf(ConflictException);
		const replacement = await invite();
		expect(replacement.id).not.toBe(grant.id);
		expect(m.state.invitations.find((g) => g.id === grant.id)!.status).toBe(
			'EXPIRED',
		);
	});
	it('should block duplicate pending invitation and duplicate active member invitation', async () => {
		await expect(invite()).rejects.toBeInstanceOf(ConflictException);
		id = m.seedGroup([1]);
		await invite();
		await expect(invite()).rejects.toBeInstanceOf(ConflictException);
	});
	it('should not replay an accepted invitation after leave; fresh invitation reactivates the same pair as MEMBER', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		await service.decideInvitation(target, grant.id, true);
		await service.leave(target, id, state());
		await expect(
			service.decideInvitation(target, grant.id, true),
		).rejects.toBeInstanceOf(ConflictException);
		const fresh = await invite();
		await service.decideInvitation(target, fresh.id, true);
		expect(
			current().memberships.filter(
				(m) => m.expertId === groupExpertId(2),
			),
		).toHaveLength(1);
		expect(
			current().memberships.find((m) => m.expertId === groupExpertId(2))!
				.role,
		).toBe('MEMBER');
	});
	it('should serialize simulated concurrent accepts into one membership and one accepted audit', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		const results = await Promise.allSettled([
			service.decideInvitation(target, grant.id, true),
			service.decideInvitation(target, grant.id, true),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(current().memberships).toHaveLength(2);
		expect(
			m.state.audits.filter((a) => a.action === 'INVITATION_ACCEPTED'),
		).toHaveLength(1);
	});
	it('should revoke only a same-group grant and permit verified expired-leader recovery', async () => {
		id = m.seedGroup([1]);
		const grant = await invite();
		m.state.experts[0].credentialSuspendedAt = new Date();
		await expect(
			service.revokeInvitation(user, 1, grant.id, {
				expectedStateHash: groupStateHash(
					m.snapshotGroup(m.state.groups[0]),
				),
			}),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(
			(await service.revokeInvitation(user, id, grant.id, state()))
				.status,
		).toBe('REVOKED');
		await expect(
			service.decideInvitation(target, grant.id, true),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should prohibit leader leave/removal, preserve inputs on ordinary removal, and allow expired member leave', async () => {
		await expect(service.leave(user, id, state())).rejects.toBeInstanceOf(
			ConflictException,
		);
		await expect(
			service.remove(user, id, groupExpertId(1), {
				...state(),
				reason: 'Reason',
			}),
		).rejects.toBeInstanceOf(ConflictException);
		const inputs = structuredClone(m.state.experts);
		await service.remove(user, id, groupExpertId(2), {
			...state(),
			reason: 'Membership review',
		});
		expect(m.state.experts).toEqual(inputs);
		expect(m.state.audits.at(-1)?.reason).toBe('Membership review');
		id = m.seedGroup([1, 2]);
		m.state.experts[1].credentialSuspendedAt = new Date();
		expect(
			(await service.leave(target, id, state())).membershipStatus,
		).toBe('LEFT');
	});
	it('should permit recovery transfer only to a current valid active member, preserving source until consent', async () => {
		m.state.experts[0].credentialSuspendedAt = new Date();
		const grant = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		expect(
			current().memberships.find((m) => m.role === 'LEADER')!.expertId,
		).toBe(groupExpertId(1));
		await expect(
			service.decideTransfer(groupUserId(3), grant.id, true),
		).rejects.toBeInstanceOf(NotFoundException);
		await service.decideTransfer(target, grant.id, true);
		expect(
			current().memberships.filter((m) => m.role === 'LEADER'),
		).toHaveLength(1);
		expect(
			current().memberships.find((m) => m.role === 'LEADER')!.expertId,
		).toBe(groupExpertId(2));
		await expect(
			service.decideTransfer(target, grant.id, true),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should revoke old-leader pending invitations on accepted leadership transfer', async () => {
		const invitation = await service.invite(user, id, {
			...state(),
			recipientUserId: groupUserId(3),
		});
		const grant = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		await service.decideTransfer(target, grant.id, true);
		expect(
			m.state.invitations.find((g) => g.id === invitation.id)!.status,
		).toBe('REVOKED');
		await expect(
			service.invite(user, id, {
				...state(),
				recipientUserId: groupUserId(4),
			}),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should reject stale transfer after membership/metadata change and let current leader revoke/reissue', async () => {
		const grant = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		await service.update(user, id, { ...state(), ...metadata });
		await expect(
			service.decideTransfer(target, grant.id, true),
		).rejects.toBeInstanceOf(ConflictException);
		expect(
			(await service.revokeTransfer(user, id, grant.id, state())).status,
		).toBe('REVOKED');
		expect(
			(
				await service.proposeTransfer(user, id, {
					...state(),
					targetExpertId: groupExpertId(2),
				})
			).status,
		).toBe('PENDING');
	});
	it('should roll back both role changes and invitation revocation if transfer audit fails', async () => {
		const grant = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		const before = structuredClone(m.state);
		m.tx.groupAudit.create.mockRejectedValueOnce(new Error('audit failed'));
		await expect(
			service.decideTransfer(target, grant.id, true),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(m.state).toEqual(before);
	});
	it('should reject transfer acceptance if source loses verified EXPERT account or target loses credentials/membership', async () => {
		const grant = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		m.state.experts[0].user.role = 'USER';
		await expect(
			service.decideTransfer(target, grant.id, true),
		).rejects.toBeInstanceOf(ForbiddenException);
		m.state.experts[0].user.role = 'EXPERT';
		m.state.experts[1].credentialSuspendedAt = new Date();
		await expect(
			service.decideTransfer(target, grant.id, true),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should allow recipient decline and expire/reissue leadership grants without Group timestamp changes', async () => {
		const before = current().updatedAt;
		const first = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		expect(
			(await service.decideTransfer(target, first.id, false)).status,
		).toBe('DECLINED');
		const second = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		jest.setSystemTime(second.expiresAt);
		expect(
			(await service.transfers(target, new GroupPageQuery())).items.some(
				(g) => g.status === 'EXPIRED',
			),
		).toBe(true);
		await expect(
			service.decideTransfer(target, second.id, true),
		).rejects.toBeInstanceOf(ConflictException);
		await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		expect(current().updatedAt).toEqual(before);
	});
	it('should archive with recovery authority, preserve membership/input/audit, revoke all grants and block mutations', async () => {
		const invitation = await service.invite(user, id, {
			...state(),
			recipientUserId: groupUserId(3),
		});
		const transfer = await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		const inputs = structuredClone(m.state.experts);
		m.state.experts[0].credentialSuspendedAt = new Date();
		inputs[0].credentialSuspendedAt = new Date();
		const archived = await service.archive(user, id, {
			...state(),
			reason: 'Group completed its work',
		});
		expect(archived.archivedAt).not.toBeNull();
		expect(m.state.experts).toEqual(inputs);
		expect(current().memberships).toHaveLength(2);
		expect(m.state.audits.at(-1)?.reason).toBe('Group completed its work');
		expect(
			m.state.invitations.find((g) => g.id === invitation.id)!.status,
		).toBe('REVOKED');
		expect(
			m.state.transfers.find((g) => g.id === transfer.id)!.status,
		).toBe('REVOKED');
		await expect(
			service.decideInvitation(groupUserId(3), invitation.id, true),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should scope private outboxes/audit to current leader and redact persistence errors', async () => {
		await expect(
			service.audits(target, id, new GroupPageQuery()),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.invitations(target, new GroupPageQuery(), id),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			service.transfers(target, new GroupPageQuery(), id),
		).rejects.toBeInstanceOf(ForbiddenException);
		m.tx.group.findUnique.mockRejectedValueOnce(
			new Error('postgresql://private-secret'),
		);
		await expect(service.detail(user, id)).rejects.toThrow(
			'Group persistence unavailable',
		);
	});
	it('should lock sorted distinct Users before the Group and expose serialization/unique conflicts as 409', async () => {
		await service.proposeTransfer(user, id, {
			...state(),
			targetExpertId: groupExpertId(2),
		});
		const calls = m.tx.$queryRaw.mock.calls as unknown as [
			TemplateStringsArray,
			string | number,
		][];
		expect(calls.slice(0, 2).map((c) => c[1])).toEqual(
			[user, target].sort(),
		);
		expect(calls[2][0].join('')).toContain('FROM "Group"');
		m.tx.groupAudit.create.mockRejectedValueOnce({ code: 'P2034' });
		await expect(
			service.update(user, id, { ...state(), ...metadata }),
		).rejects.toBeInstanceOf(ConflictException);
	});
});
