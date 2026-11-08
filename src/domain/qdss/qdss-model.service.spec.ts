import {
	ConflictException,
	ForbiddenException,
	ServiceUnavailableException,
} from '@nestjs/common';
import {
	qdssFixture,
	qdssAdmin,
	datasetSubmission,
} from '../../../test/qdss-mocks';
import { groupUserId } from '../../../test/groups-mocks';
import { SystemRandom } from './math/ga';
describe('Server-side authorized model calibration and atomic activation', () => {
	let f: Awaited<ReturnType<typeof qdssFixture>>;
	beforeEach(async () => {
		f = await qdssFixture();
		jest.spyOn(SystemRandom.prototype, 'uniform').mockReturnValue(0.5);
	});
	afterEach(() => jest.restoreAllMocks());
	const run = async (
		f: Awaited<ReturnType<typeof qdssFixture>>,
		user = groupUserId(1),
		group: number | null = f.groupId,
	) =>
		f.models.recalibrate(
			user,
			group,
			(await f.models.read(user, group)).nextInputHash!,
		);
	it('should create a first model only on a leader command and expose stable derived weights', async () => {
		expect((await f.models.read(groupUserId(2), f.groupId)).readiness).toBe(
			'UNINITIALIZED',
		);
		expect(f.m.state.runs).toHaveLength(0);
		const before = structuredClone(f.m.groups.state);
		const result = await run(f);
		expect(result.status).toBe('SUCCEEDED');
		const view = await f.models.read(groupUserId(2), f.groupId);
		expect(view.readiness).toBe('CURRENT');
		expect(view.model!.weights).toHaveLength(5);
		expect(f.m.groups.state).toEqual(before);
	});
	it('should calibrate global only as ADMIN and use the four fixed reference identities', async () => {
		await expect(run(f, groupUserId(1), null)).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		await run(f, qdssAdmin, null);
		expect(
			(await f.models.read(qdssAdmin, null)).model!.weights.map(
				(w) => w.contributorId,
			),
		).toEqual(['reference-1', 'reference-2', 'reference-3', 'reference-4']);
	});
	it('should keep an inherited active model pinned until the leader explicitly recalibrates', async () => {
		const first = await run(f);
		await f.calibration.replace(
			qdssAdmin,
			null,
			await datasetSubmission(f, qdssAdmin, null, 25),
		);
		const current = await f.models.read(groupUserId(1), f.groupId);
		expect(current.readiness).toBe('CURRENT');
		expect(current.model!.datasetId).toBe(first.datasetId);
		const second = await run(f);
		expect(second.datasetId).not.toBe(first.datasetId);
		expect(f.m.state.runs[0].datasetId).toBe(first.datasetId);
	});
	it('should use custom samples independently of subsequent global updates', async () => {
		const custom = await f.calibration.replace(
			groupUserId(1),
			f.groupId,
			await datasetSubmission(f, groupUserId(1), f.groupId, 25),
		);
		const first = await run(f);
		await f.calibration.replace(
			qdssAdmin,
			null,
			await datasetSubmission(f, qdssAdmin, null, 30),
		);
		expect(
			(await f.models.read(groupUserId(1), f.groupId)).model!.datasetId,
		).toBe(custom.id);
		expect((await run(f)).datasetId).toBe(first.datasetId);
	});
	it('should reject ordinary members and stale expected input tokens', async () => {
		const token = (await f.models.read(groupUserId(1), f.groupId))
			.nextInputHash!;
		await expect(
			f.models.recalibrate(groupUserId(2), f.groupId, token),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			f.models.recalibrate(groupUserId(1), f.groupId, '0'.repeat(64)),
		).rejects.toBeInstanceOf(ConflictException);
		expect(f.m.state.runs).toHaveLength(0);
	});
	it('should detect member-period changes even when the same expert rejoins', async () => {
		await run(f);
		f.m.groups.state.memberships[0].joinedAt = new Date(Date.now() + 1000);
		expect((await f.models.read(groupUserId(1), f.groupId)).readiness).toBe(
			'STALE_INPUT',
		);
	});
	it('should refuse model consumption after contributor expiry or group archive', async () => {
		await run(f);
		f.m.groups.state.experts[0].credentialSuspendedAt = new Date();
		expect((await f.models.read(groupUserId(2), f.groupId)).readiness).toBe(
			'STALE_INPUT',
		);
		f.m.groups.state.groups[0].archivedAt = new Date();
		expect((await f.models.read(groupUserId(2), f.groupId)).readiness).toBe(
			'INELIGIBLE',
		);
	});
	it('should preserve old active model when input changes during GA and record a stale run', async () => {
		const first = await run(f);
		let changed = false;
		jest.spyOn(SystemRandom.prototype, 'normal').mockReturnValue(0);
		jest.spyOn(SystemRandom.prototype, 'uniform').mockImplementation(() => {
			if (!changed) {
				changed = true;
				Object.assign(f.m.groups.state.experts[0].preferences[0], {
					percentDepression: 100,
					percentAnxiety: 0,
					percentStress: 0,
				});
			}
			return 0.5;
		});
		await expect(run(f)).rejects.toBeInstanceOf(ConflictException);
		expect(
			f.m.state.configurations.find((c) => c.groupId === f.groupId)!
				.activeRunId,
		).toBe(first.id);
		expect(f.m.state.runs.at(-1)!.status).toBe('STALE');
	});
	it('should recheck current leader identity at final activation', async () => {
		let changed = false;
		jest.spyOn(SystemRandom.prototype, 'uniform').mockImplementation(() => {
			if (!changed) {
				changed = true;
				f.m.groups.state.memberships[0].role = 'MEMBER';
				f.m.groups.state.memberships[1].role = 'LEADER';
			}
			return 0.5;
		});
		await expect(run(f)).rejects.toBeInstanceOf(ForbiddenException);
		expect(f.m.state.runs[0].status).toBe('FAILED');
		expect(
			f.m.state.configurations.find((c) => c.groupId === f.groupId)!
				.activeRunId,
		).toBeNull();
	});
	it('should roll back activation output/pointer if its audit fails', async () => {
		const first = await run(f);
		const original = f.m.tx.qdssAudit.create.getMockImplementation()!;
		let failed = false;
		f.m.tx.qdssAudit.create.mockImplementation((args) => {
			if (args.data.action === 'MODEL_ACTIVATED' && !failed) {
				failed = true;
				throw new Error('Synthetic activation audit fault');
			}
			return original(args);
		});
		await expect(run(f)).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		expect(
			f.m.state.configurations.find((c) => c.groupId === f.groupId)!
				.activeRunId,
		).toBe(first.id);
		expect(f.m.state.runs.at(-1)!.status).toBe('FAILED');
		expect(f.m.state.runs.at(-1)!.weights).toBeNull();
	});
	it('should reject simultaneous calibration commands without running a duplicate', async () => {
		const token = (await f.models.read(groupUserId(1), f.groupId))
			.nextInputHash!;
		const results = await Promise.allSettled([
			f.models.recalibrate(groupUserId(1), f.groupId, token),
			f.models.recalibrate(groupUserId(1), f.groupId, token),
		]);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
		expect(f.m.state.runs).toHaveLength(1);
	});
	it('should fail closed on altered output, without disclosing the snapshot through run metadata', async () => {
		const r = await run(f);
		const metadata = await f.models.runDetail(
			groupUserId(2),
			f.groupId,
			r.id,
		);
		expect(Object.keys(metadata)).not.toContain('snapshot');
		f.m.state.runs[0].weights = [1, 0, 0, 0, 0];
		await expect(
			f.models.read(groupUserId(2), f.groupId),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('should recover an abandoned persisted run without deleting past evidence', async () => {
		const token = (await f.models.read(groupUserId(1), f.groupId))
			.nextInputHash!;
		await run(f);
		const old = f.m.state.runs[0];
		old.status = 'RUNNING';
		old.completedAt = null;
		old.createdAt = new Date(Date.now() - 180000);
		f.m.state.configurations.find(
			(c) => c.groupId === f.groupId,
		)!.activeRunId = null;
		expect(
			(await f.models.recalibrate(groupUserId(1), f.groupId, token))
				.status,
		).toBe('SUCCEEDED');
		expect(f.m.state.runs[0].failureCode).toBe('ABANDONED');
	});
});
