import {
	createGroupsHttp,
	groupHeaders,
	httpData,
} from '../../test/groups-http';
import type { PrivateGroupDto } from './dto/group-responses.dto';

describe('GroupsController HTTP contract', () => {
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
	it('should require authentication and EXPERT role before reading private data', async () => {
		await h.api().get(`/expert/groups/${id}`).expect(401);
		for (const role of ['ADMIN', 'USER'])
			await h
				.api()
				.get(`/expert/groups/${id}`)
				.set('x-test-role', role)
				.expect(403);
		expect(h.mocks.transaction).not.toHaveBeenCalled();
	});
	it.each([
		{ name: '', description: 'Text' },
		{ name: 'Text', description: '   ' },
		{ name: 7, description: 'Text' },
		{ name: 'Text', description: 'Text', isPublic: true },
		{ name: 'x'.repeat(121), description: 'Text' },
	])(
		'should reject malformed or caller-controlled governance fields %p',
		async (body) => {
			await h
				.api()
				.post('/expert/groups')
				.set(groupHeaders())
				.send(body)
				.expect(400);
			expect(h.mocks.tx.group.create).not.toHaveBeenCalled();
		},
	);
	it('should protect detail/metadata/eligibility/audit and enforce stale-state and reason validation', async () => {
		const response = await h
			.api()
			.get(`/expert/groups/${id}`)
			.set(groupHeaders())
			.expect(200);
		expect(response.headers['cache-control']).toBe('no-store');
		const group = httpData<PrivateGroupDto>(response);
		await h
			.api()
			.put(`/expert/groups/${id}`)
			.set(groupHeaders(2))
			.send({
				name: 'Changed',
				description: 'Description',
				expectedStateHash: group.stateHash,
			})
			.expect(403);
		await h
			.api()
			.put(`/expert/groups/${id}`)
			.set(groupHeaders())
			.send({
				name: 'Changed',
				description: 'Description',
				expectedStateHash: '0'.repeat(64),
			})
			.expect(409);
		await h
			.api()
			.post(`/expert/groups/${id}/archive`)
			.set(groupHeaders())
			.send({ expectedStateHash: group.stateHash, reason: '  ' })
			.expect(400);
		await h
			.api()
			.get(`/expert/groups/${id}/audit`)
			.set(groupHeaders(2))
			.expect(403);
		await h
			.api()
			.get(`/expert/groups/${id}/eligibility`)
			.set(groupHeaders(3))
			.expect(403);
		await h
			.api()
			.get('/expert/me/groups?limit=101')
			.set(groupHeaders())
			.expect(400);
		await h.api().get('/expert/me/groups').set(groupHeaders()).expect(200);
	});
	it('should keep create/metadata detail independent of missing reference data and hide raw database failure', async () => {
		h.mocks.tx.dASS21.findMany.mockRejectedValue(
			new Error('sensitive source'),
		);
		await h
			.api()
			.post('/expert/groups')
			.set(groupHeaders())
			.send({ name: 'Group', description: 'Description' })
			.expect(201);
		await h
			.api()
			.get(`/expert/groups/${id}`)
			.set(groupHeaders())
			.expect(200);
		const response = await h
			.api()
			.get(`/expert/groups/${id}/eligibility`)
			.set(groupHeaders())
			.expect(503);
		expect(JSON.stringify(response.body)).not.toContain('sensitive source');
	});
});
