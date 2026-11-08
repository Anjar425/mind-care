import { createQdssHttp } from './qdss-http';
import { groupHeaders, httpData } from './groups-http';
import { qdssAdmin } from './qdss-mocks';
import { SystemRandom } from '../src/domain/qdss/math/ga';
import type {
	QdssDatasetResponseDto,
	QdssModelResponseDto,
	QdssRunResponseDto,
} from '../src/api/common/dto/qdss/qdss.responses.dto';
describe('QDSS leader/admin/sample-member HTTP lifecycle', () => {
	let h: Awaited<ReturnType<typeof createQdssHttp>>;
	let groupId: number;
	const admin = { 'x-test-role': 'ADMIN', 'x-test-user': qdssAdmin };
	const base = () => `/expert/groups/${groupId}/qdss`;
	beforeEach(async () => {
		h = await createQdssHttp();
		groupId = h.mocks.groups.seedGroup([1, 2, 3, 4]);
		jest.spyOn(SystemRandom.prototype, 'uniform').mockReturnValue(0.5);
		await h
			.api()
			.post('/admin/qdss/global/initialize')
			.set(admin)
			.send({})
			.expect(200);
	});
	afterEach(async () => {
		await h?.close();
		jest.restoreAllMocks();
	});
	it('should pin an inherited global dataset until the group leader recalibrates', async () => {
		const firstView = httpData<QdssModelResponseDto>(
			await h
				.api()
				.get(`${base()}/model`)
				.set(groupHeaders())
				.expect(200),
		);
		expect(firstView.readiness).toBe('UNINITIALIZED');
		await h
			.api()
			.post(`${base()}/calibrations`)
			.set(groupHeaders(2))
			.send({ expectedInputHash: firstView.nextInputHash })
			.expect(403);
		const first = httpData<QdssRunResponseDto>(
			await h
				.api()
				.post(`${base()}/calibrations`)
				.set(groupHeaders())
				.send({ expectedInputHash: firstView.nextInputHash })
				.expect(200),
		);
		expect(first.status).toBe('SUCCEEDED');
		const global = httpData<QdssDatasetResponseDto>(
			await h
				.api()
				.get('/admin/qdss/global/calibration')
				.set(admin)
				.expect(200),
		);
		const samples = [...global.items, ...global.items.slice(0, 5)].map(
			(s) => ({ answers: s.answers }),
		);
		await h
			.api()
			.put('/admin/qdss/global/calibration')
			.set(admin)
			.send({
				catalogVersion: global.catalogVersion,
				expectedStateHash: global.stateHash,
				samples,
			})
			.expect(200);
		const pinned = httpData<QdssModelResponseDto>(
			await h
				.api()
				.get(`${base()}/model`)
				.set(groupHeaders(2))
				.expect(200),
		);
		expect(pinned.readiness).toBe('CURRENT');
		expect(pinned.model!.datasetId).toBe(first.datasetId);
		const second = httpData<QdssRunResponseDto>(
			await h
				.api()
				.post(`${base()}/calibrations`)
				.set(groupHeaders())
				.send({ expectedInputHash: pinned.nextInputHash })
				.expect(200),
		);
		expect(second.datasetId).not.toBe(first.datasetId);
		await h
			.api()
			.get(`${base()}/calibrations/${first.id}`)
			.set(groupHeaders(2))
			.expect(200);
	});
	it('should accept leader custom samples, preserve member reads, and deny cross-group and admin group edits', async () => {
		const current = httpData<QdssDatasetResponseDto>(
			await h
				.api()
				.get(`${base()}/calibration`)
				.set(groupHeaders())
				.expect(200),
		);
		const payload = {
			catalogVersion: current.catalogVersion,
			expectedStateHash: current.stateHash,
			samples: current.items.map((s) => ({ answers: s.answers })),
		};
		await h
			.api()
			.put(`${base()}/calibration`)
			.set(groupHeaders(2))
			.send(payload)
			.expect(403);
		await h
			.api()
			.put(`${base()}/calibration`)
			.set(admin)
			.send(payload)
			.expect(403);
		await h
			.api()
			.put(`${base()}/calibration`)
			.set(groupHeaders())
			.send(payload)
			.expect(200);
		const own = httpData<QdssDatasetResponseDto>(
			await h
				.api()
				.get(`${base()}/calibration`)
				.set(groupHeaders(2))
				.expect(200),
		);
		expect(own.source).toBe('GROUP');
		const other = h.mocks.groups.seedGroup([1, 3, 4, 5]);
		await h
			.api()
			.get(
				`/expert/groups/${other}/qdss/calibration?revisionId=${own.revisionId}`,
			)
			.set(groupHeaders())
			.expect(404);
		const bad = { ...payload, samples: payload.samples.slice(0, 19) };
		await h
			.api()
			.put(`${base()}/calibration`)
			.set(groupHeaders())
			.send(bad)
			.expect(400);
	});
});
