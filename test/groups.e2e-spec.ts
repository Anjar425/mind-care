import { createGroupsHttp, groupHeaders, httpData } from './groups-http';
import { groupExpertId, groupUserId } from './groups-mocks';
import type {
	GroupInvitationDto,
	GroupTransferDto,
	PrivateGroupDto,
	PublicGroupDto,
} from '../src/groups/dto/group-responses.dto';

describe('Group lifecycle HTTP integration (synthetic auth/DB; real policies)', () => {
	let h: Awaited<ReturnType<typeof createGroupsHttp>>;
	beforeEach(async () => {
		h = await createGroupsHttp();
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	it('should create, invite/join, publish, transfer, withdraw and archive while preserving expert input', async () => {
		let group = httpData<PrivateGroupDto>(
			await h
				.api()
				.post('/expert/groups')
				.set(groupHeaders())
				.send({
					name: 'Screening group',
					description: 'Professional contributors',
				})
				.expect(201),
		);
		for (const n of [2, 3, 4]) {
			const invitation = httpData<GroupInvitationDto>(
				await h
					.api()
					.post(`/expert/groups/${group.id}/invitations`)
					.set(groupHeaders())
					.send({
						recipientUserId: groupUserId(n),
						expectedStateHash: group.stateHash,
					})
					.expect(201),
			);
			await h
				.api()
				.post(`/expert/me/group-invitations/${invitation.id}/accept`)
				.set(groupHeaders(n))
				.send({})
				.expect(200);
			group = httpData<PrivateGroupDto>(
				await h
					.api()
					.get(`/expert/groups/${group.id}`)
					.set(groupHeaders())
					.expect(200),
			);
		}
		const publicGroup = httpData<PublicGroupDto>(
			await h.api().get(`/groups/public/${group.id}`).expect(200),
		);
		expect(publicGroup.validExpertCount).toBe(4);
		const transfer = httpData<GroupTransferDto>(
			await h
				.api()
				.post(`/expert/groups/${group.id}/leadership-transfers`)
				.set(groupHeaders())
				.send({
					targetExpertId: groupExpertId(2),
					expectedStateHash: group.stateHash,
				})
				.expect(201),
		);
		await h
			.api()
			.post(`/expert/me/group-leadership-transfers/${transfer.id}/accept`)
			.set(groupHeaders(2))
			.send({})
			.expect(200);
		group = httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${group.id}`)
				.set(groupHeaders(2))
				.expect(200),
		);
		expect(group.ownRole).toBe('LEADER');
		const inputs = structuredClone(h.mocks.state.experts);
		await h
			.api()
			.post(
				`/expert/groups/${group.id}/members/${groupExpertId(4)}/remove`,
			)
			.set(groupHeaders(2))
			.send({
				expectedStateHash: group.stateHash,
				reason: 'Membership review',
			})
			.expect(200);
		await h.api().get(`/groups/public/${group.id}`).expect(404);
		expect(h.mocks.state.experts).toEqual(inputs);
		group = httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${group.id}`)
				.set(groupHeaders(2))
				.expect(200),
		);
		await h
			.api()
			.post(`/expert/groups/${group.id}/leave`)
			.set(groupHeaders())
			.send({ expectedStateHash: group.stateHash })
			.expect(200);
		group = httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${group.id}`)
				.set(groupHeaders(2))
				.expect(200),
		);
		await h
			.api()
			.post(`/expert/groups/${group.id}/archive`)
			.set(groupHeaders(2))
			.send({
				expectedStateHash: group.stateHash,
				reason: 'Work completed',
			})
			.expect(200);
		expect(h.mocks.state.groups[0].archivedAt).not.toBeNull();
		expect(h.mocks.state.audits.some((a) => a.action === 'ARCHIVED')).toBe(
			true,
		);
	});
	it('should keep persistence rollback failures generic over HTTP', async () => {
		h.mocks.tx.groupAudit.create.mockRejectedValueOnce(
			new Error('private-synthetic-db-detail'),
		);
		const response = await h
			.api()
			.post('/expert/groups')
			.set(groupHeaders())
			.send({ name: 'Group', description: 'Description' })
			.expect(503);
		expect(JSON.stringify(response.body)).not.toContain(
			'private-synthetic-db-detail',
		);
		expect(h.mocks.state.groups).toHaveLength(0);
		expect(h.mocks.state.memberships).toHaveLength(0);
	});
});
