import {
	createGroupsHttp,
	groupHeaders,
	httpData,
} from '../../test/groups-http';
import { groupExpertId } from '../../test/groups-mocks';
import type {
	GroupTransferDto,
	PrivateGroupDto,
} from './dto/group-responses.dto';

describe('GroupLeadershipController HTTP contract', () => {
	let h: Awaited<ReturnType<typeof createGroupsHttp>>;
	let id: number;
	beforeEach(async () => {
		h = await createGroupsHttp();
		id = h.mocks.seedGroup([1, 2]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	const propose = async () => {
		const group = httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${id}`)
				.set(groupHeaders())
				.expect(200),
		);
		return httpData<GroupTransferDto>(
			await h
				.api()
				.post(`/expert/groups/${id}/leadership-transfers`)
				.set(groupHeaders())
				.send({
					targetExpertId: groupExpertId(2),
					expectedStateHash: group.stateHash,
				})
				.expect(201),
		);
	};
	it('should require exact recipient consent, expose scoped inbox/outbox and allow decline', async () => {
		const grant = await propose();
		await h
			.api()
			.get('/expert/me/group-leadership-transfers')
			.set(groupHeaders(2))
			.expect(200);
		await h
			.api()
			.get(`/expert/groups/${id}/leadership-transfers`)
			.set(groupHeaders())
			.expect(200);
		await h
			.api()
			.get(`/expert/groups/${id}/leadership-transfers`)
			.set(groupHeaders(2))
			.expect(403);
		await h
			.api()
			.post(`/expert/me/group-leadership-transfers/${grant.id}/accept`)
			.set(groupHeaders(3))
			.send({})
			.expect(404);
		await h
			.api()
			.post(`/expert/me/group-leadership-transfers/${grant.id}/accept`)
			.set(groupHeaders(2))
			.send({ targetExpertId: groupExpertId(3) })
			.expect(400);
		const result = await h
			.api()
			.post(`/expert/me/group-leadership-transfers/${grant.id}/decline`)
			.set(groupHeaders(2))
			.send({})
			.expect(200);
		expect(httpData<GroupTransferDto>(result).status).toBe('DECLINED');
		expect(
			h.mocks.state.memberships.find((m) => m.role === 'LEADER')!
				.expertId,
		).toBe(groupExpertId(1));
	});
	it('should allow leader to revoke a grant and reject stale recipient replay', async () => {
		const grant = await propose();
		const group = httpData<PrivateGroupDto>(
			await h
				.api()
				.get(`/expert/groups/${id}`)
				.set(groupHeaders())
				.expect(200),
		);
		await h
			.api()
			.post(
				`/expert/groups/${id}/leadership-transfers/${grant.id}/revoke`,
			)
			.set(groupHeaders())
			.send({ expectedStateHash: group.stateHash })
			.expect(200);
		await h
			.api()
			.post(`/expert/me/group-leadership-transfers/${grant.id}/accept`)
			.set(groupHeaders(2))
			.send({})
			.expect(409);
	});
	it('should protect transfer routes with expert auth and validate target IDs', async () => {
		await h.api().get('/expert/me/group-leadership-transfers').expect(401);
		await h
			.api()
			.get('/expert/me/group-leadership-transfers')
			.set('x-test-role', 'USER')
			.expect(403);
		await h
			.api()
			.post(`/expert/groups/${id}/leadership-transfers`)
			.set(groupHeaders())
			.send({
				targetExpertId: 'invalid',
				expectedStateHash: '0'.repeat(64),
			})
			.expect(400);
	});
});
