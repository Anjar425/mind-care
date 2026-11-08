import {
	DocumentBuilder,
	SwaggerModule,
	type OpenAPIObject,
} from '@nestjs/swagger';
import { createQdssHttp } from '../../../../../test/qdss-http';
import { groupHeaders, httpData } from '../../../../../test/groups-http';
import { groupUserId } from '../../../../../test/groups-mocks';
import { qdssAdmin } from '../../../../../test/qdss-mocks';
import type { QdssDatasetResponseDto } from '../../../common/dto/qdss/qdss.responses.dto';
type OperationObject = NonNullable<OpenAPIObject['paths'][string]['get']>;
describe('QDSS controller auth/validation/documentation boundary', () => {
	let h: Awaited<ReturnType<typeof createQdssHttp>>;
	let groupId: number;
	const admin = { 'x-test-role': 'ADMIN', 'x-test-user': qdssAdmin };
	beforeEach(async () => {
		h = await createQdssHttp();
		groupId = h.mocks.groups.seedGroup([1, 2, 3, 4]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	it('should reject absent authentication, inappropriate roles and spoofed current database roles', async () => {
		await h.api().get('/admin/qdss/global/model').expect(401);
		await h
			.api()
			.post('/admin/qdss/global/initialize')
			.set(groupHeaders())
			.send({})
			.expect(403);
		await h
			.api()
			.post('/admin/qdss/global/initialize')
			.set('x-test-role', 'ADMIN')
			.set('x-test-user', groupUserId(1))
			.send({})
			.expect(403);
		expect(h.mocks.state.references).toHaveLength(0);
	});
	it('should initialize only explicitly and let active group members read shared global samples', async () => {
		expect(h.mocks.state.references).toHaveLength(0);
		await h
			.api()
			.post('/admin/qdss/global/initialize')
			.set(admin)
			.send({})
			.expect(200);
		const response = await h
			.api()
			.get('/expert/qdss/global/calibration')
			.set(groupHeaders(2))
			.expect(200);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(httpData<QdssDatasetResponseDto>(response).items).toHaveLength(
			20,
		);
		await h
			.api()
			.get('/expert/qdss/global/calibration')
			.set(groupHeaders(6))
			.expect(403);
	});
	it('should validate unknown fields, ID bounds and pagination before mutation', async () => {
		await h
			.api()
			.post('/admin/qdss/global/initialize')
			.set(admin)
			.send({ packs: [] })
			.expect(400);
		await h
			.api()
			.get('/expert/groups/0/qdss/model')
			.set(groupHeaders())
			.expect(400);
		for (const query of [
			'page=0',
			'limit=101',
			'revisionId=wrong',
			'includePrivate=true',
		])
			await h
				.api()
				.get(`/expert/groups/${groupId}/qdss/calibration?${query}`)
				.set(groupHeaders())
				.expect(400);
		await h
			.api()
			.post(`/expert/groups/${groupId}/qdss/calibrations`)
			.set(groupHeaders())
			.send({ expectedInputHash: 'invalid' })
			.expect(400);
		expect(h.mocks.state.runs).toHaveLength(0);
	});
	it('should expose twelve typed governance operations without public patient or reference-pack edit endpoints', () => {
		const doc = SwaggerModule.createDocument(
			h.app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		const operations = Object.values(doc.paths).flatMap((path) =>
			Object.entries(path).flatMap(([method, operation]) =>
				['get', 'put', 'post', 'delete', 'patch'].includes(method)
					? [operation as OperationObject]
					: [],
			),
		);
		expect(operations).toHaveLength(12);
		for (const operation of operations) {
			expect(operation.security?.length).toBeGreaterThan(0);
			expect(operation.responses).toHaveProperty('200');
			expect(operation.responses).toHaveProperty('503');
		}
		expect(
			Object.keys(doc.paths).some(
				(p) =>
					p.includes('history') ||
					p.includes('reference-experts') ||
					p.includes('public'),
			),
		).toBe(false);
	});
});
