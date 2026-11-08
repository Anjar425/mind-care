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
import { QdssPageQuery } from '../../api/common/dto/qdss/qdss.requests.dto';
describe('Calibration dataset governance with synthetic persistence', () => {
	let f: Awaited<ReturnType<typeof qdssFixture>>;
	beforeEach(async () => {
		f = await qdssFixture();
	});
	it('should initialize fixed references/default samples explicitly and idempotently', async () => {
		await f.calibration.initialize(qdssAdmin);
		expect(f.m.state.references).toHaveLength(1);
		expect(f.m.state.datasets).toHaveLength(1);
		expect(f.m.state.configurations).toHaveLength(1);
		expect(f.m.state.runs).toHaveLength(0);
	});
	it('should let an ordinary active member read global and own-group inherited samples', async () => {
		const global = await f.calibration.read(
			groupUserId(2),
			null,
			new QdssPageQuery(),
		);
		const inherited = await f.calibration.read(
			groupUserId(2),
			f.groupId,
			new QdssPageQuery(),
		);
		expect(global.items).toHaveLength(20);
		expect(inherited.revisionId).toBe(global.revisionId);
		expect(inherited.source).toBe('GLOBAL');
	});
	it('should reject nonmembers and archived-only global memberships', async () => {
		await expect(
			f.calibration.read(groupUserId(6), null, new QdssPageQuery()),
		).rejects.toBeInstanceOf(ForbiddenException);
		f.m.groups.state.groups[0].archivedAt = new Date();
		await expect(
			f.calibration.read(groupUserId(2), null, new QdssPageQuery()),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should restrict group edits to the current valid leader without granting ADMIN an override', async () => {
		const dto = await datasetSubmission(f, groupUserId(1), f.groupId);
		await expect(
			f.calibration.replace(groupUserId(2), f.groupId, dto),
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			f.calibration.replace(qdssAdmin, f.groupId, dto),
		).rejects.toBeInstanceOf(ForbiddenException);
		f.m.groups.state.experts[0].credentialSuspendedAt = new Date();
		await expect(
			f.calibration.replace(groupUserId(1), f.groupId, dto),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
	it('should accept more than 20 samples and retain separate immutable revisions', async () => {
		const user = groupUserId(1);
		const first = await f.calibration.replace(
			user,
			f.groupId,
			await datasetSubmission(f, user, f.groupId, 25),
		);
		const second = await f.calibration.replace(
			user,
			f.groupId,
			await datasetSubmission(f, user, f.groupId, 30),
		);
		expect(first.version).toBe(1);
		expect(second.version).toBe(2);
		expect(f.m.state.datasets).toHaveLength(3);
		const old = await f.calibration.read(groupUserId(2), f.groupId, {
			...new QdssPageQuery(),
			revisionId: first.id,
		});
		expect(old.sampleCount).toBe(25);
		expect(f.m.state.runs).toHaveLength(0);
	});
	it('should reject a stale replacement token and keep previous samples intact', async () => {
		const user = groupUserId(1),
			dto = await datasetSubmission(f, user, f.groupId);
		await f.calibration.replace(user, f.groupId, dto);
		const before = structuredClone(f.m.state);
		await expect(
			f.calibration.replace(user, f.groupId, dto),
		).rejects.toBeInstanceOf(ConflictException);
		expect(f.m.state).toEqual(before);
	});
	it('should reject short/invalid custom submissions without padding from the global dataset', async () => {
		const user = groupUserId(1),
			dto = await datasetSubmission(f, user, f.groupId);
		dto.samples.pop();
		await expect(
			f.calibration.replace(user, f.groupId, dto),
		).rejects.toThrow();
		expect(f.m.state.datasets).toHaveLength(1);
	});
	it('should roll back dataset and selected pointer if the audit write fails', async () => {
		const dto = await datasetSubmission(f, groupUserId(1), f.groupId);
		const before = structuredClone(f.m.state);
		f.m.tx.qdssAudit.create.mockRejectedValueOnce(
			new Error('Synthetic audit failure'),
		);
		await expect(
			f.calibration.replace(groupUserId(1), f.groupId, dto),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(f.m.state).toEqual(before);
	});
	it('should deny other-group revision IDs and preserve private scope', async () => {
		const dto = await datasetSubmission(f, groupUserId(1), f.groupId),
			saved = await f.calibration.replace(groupUserId(1), f.groupId, dto);
		const other = f.m.groups.seedGroup([1, 2, 3, 4]);
		await expect(
			f.calibration.read(groupUserId(1), other, {
				...new QdssPageQuery(),
				revisionId: saved.id,
			}),
		).rejects.toThrow();
	});
	it('should not permit arbitrary mutations of fixed global reference packs', async () => {
		(
			f.m.state.references[0].content as unknown as {
				preferences: number[][];
			}[]
		)[0].preferences[0] = [100, 0, 0];
		await expect(
			f.calibration.initialize(qdssAdmin),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
});
