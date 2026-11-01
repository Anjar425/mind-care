import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createGroupsHttp, httpData } from '../../test/groups-http';
import type { PublicGroupsPageDto } from './dto/group-responses.dto';

describe('PublicGroupsController HTTP contract', () => {
	let h: Awaited<ReturnType<typeof createGroupsHttp>>;
	let id: number;
	beforeEach(async () => {
		h = await createGroupsHttp();
		id = h.mocks.seedGroup([1, 2, 3, 4]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	it('should allow guests and expose only current eligible metadata with no-store', async () => {
		const response = await h.api().get('/groups/public').expect(200);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(httpData<PublicGroupsPageDto>(response).items[0].id).toBe(id);
		await h.api().get(`/groups/public/${id}`).expect(200);
		h.mocks.state.experts[0].credentialSuspendedAt = new Date();
		await h.api().get(`/groups/public/${id}`).expect(404);
	});
	it.each([
		'sort=uniqueUsers',
		'sort=userCount',
		'sort=unknown',
		'page=0',
		'page=1.5',
		'limit=101',
		'limit=0',
		'order=sideways',
		'includeMembers=true',
	])(
		'should explicitly reject unsupported or invalid query %s',
		async (query) => {
			await h.api().get(`/groups/public?${query}`).expect(400);
			expect(h.mocks.tx.group.findMany).not.toHaveBeenCalled();
		},
	);
	it('should document public/protected routes and typed success/error envelopes matching real codes', () => {
		const document = SwaggerModule.createDocument(
			h.app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		expect(document.paths['/groups/public'].get?.security).toBeUndefined();
		expect(document.paths['/expert/groups'].post?.security).toEqual([
			{ bearer: [] },
		]);
		expect(document.paths['/expert/groups'].post?.responses).toHaveProperty(
			'201',
		);
		expect(
			document.paths['/expert/me/group-invitations/{invitationId}/accept']
				.post?.responses,
		).toHaveProperty('200');
		const publicSchema = document.components?.schemas?.PublicGroupDto;
		expect(publicSchema).toBeDefined();
		expect(
			publicSchema && 'properties' in publicSchema
				? publicSchema.properties
				: {},
		).not.toHaveProperty('members');
		expect(document.paths['/groups/public'].get?.parameters).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'sort' })]),
		);
	});
	it('should enforce the inherited general rate limit without storing screening usage', async () => {
		for (let n = 0; n < 120; n++)
			await h.api().get('/groups/public').expect(200);
		await h.api().get('/groups/public').expect(429);
		expect(h.mocks.state.audits).toHaveLength(0);
	});
});
