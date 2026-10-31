import {
	createGroupsHttp,
	groupHeaders,
	httpData,
} from '../../test/groups-http';
import { groupUserId } from '../../test/groups-mocks';
import type {
	GroupInvitationDto,
	PrivateGroupDto,
} from './dto/group-responses.dto';

describe('GroupInvitationsController HTTP contract', () => {
	let h: Awaited<ReturnType<typeof createGroupsHttp>>;
	let id: number;
	beforeEach(async () => {
		h = await createGroupsHttp();
		id = h.mocks.seedGroup([1]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	const state = async () =>
		httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${id}`)
				.set(groupHeaders())
				.expect(200),
		);
	it('should scope inbox/outbox/revocation and validate exact account IDs and empty decision bodies', async () => {
		const g = await state();
		await h
			.api()
			.post(`/expert/groups/${id}/invitations`)
			.set(groupHeaders())
			.send({
				recipientUserId: 'not-uuid',
				expectedStateHash: g.stateHash,
			})
			.expect(400);
		const invitation = httpData<GroupInvitationDto>(
			await h
				.api()
				.post(`/expert/groups/${id}/invitations`)
				.set(groupHeaders())
				.send({
					recipientUserId: groupUserId(2),
					expectedStateHash: g.stateHash,
				})
				.expect(201),
		);
		await h
			.api()
			.get('/expert/me/group-invitations')
			.set(groupHeaders(2))
			.expect(200);
		await h
			.api()
			.get(`/expert/groups/${id}/invitations`)
			.set(groupHeaders(2))
			.expect(403);
		await h
			.api()
			.get(`/expert/groups/${id}/invitations`)
			.set(groupHeaders())
			.expect(200);
		await h
			.api()
			.post(`/expert/me/group-invitations/${invitation.id}/accept`)
			.set(groupHeaders(3))
			.send({})
			.expect(404);
		await h
			.api()
			.post(`/expert/me/group-invitations/${invitation.id}/accept`)
			.set(groupHeaders(2))
			.send({ role: 'LEADER' })
			.expect(400);
		await h
			.api()
			.post(`/expert/groups/${id}/invitations/${invitation.id}/revoke`)
			.set(groupHeaders())
			.send({ expectedStateHash: g.stateHash })
			.expect(200);
		await h
			.api()
			.post(`/expert/me/group-invitations/${invitation.id}/accept`)
			.set(groupHeaders(2))
			.send({})
			.expect(409);
	});
	it('should create no membership when invitation is declined', async () => {
		const g = await state();
		const invitation = httpData<GroupInvitationDto>(
			await h
				.api()
				.post(`/expert/groups/${id}/invitations`)
				.set(groupHeaders())
				.send({
					recipientUserId: groupUserId(2),
					expectedStateHash: g.stateHash,
				})
				.expect(201),
		);
		const result = await h
			.api()
			.post(`/expert/me/group-invitations/${invitation.id}/decline`)
			.set(groupHeaders(2))
			.send({})
			.expect(200);
		expect(httpData<GroupInvitationDto>(result).status).toBe('DECLINED');
		expect(h.mocks.state.memberships).toHaveLength(1);
	});
	it('should apply private role/auth requirements to grant routes', async () => {
		await h.api().get('/expert/me/group-invitations').expect(401);
		await h
			.api()
			.get('/expert/me/group-invitations')
			.set('x-test-role', 'ADMIN')
			.expect(403);
	});
});
