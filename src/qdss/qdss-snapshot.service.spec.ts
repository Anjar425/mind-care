import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import {
	qdssFixture,
	qdssAdmin,
	datasetSubmission,
} from '../../test/qdss-mocks';
import { groupUserId } from '../../test/groups-mocks';
describe('Current QDSS source snapshots', () => {
	let f: Awaited<ReturnType<typeof qdssFixture>>;
	beforeEach(async () => {
		f = await qdssFixture();
	});
	const db = (f: Awaited<ReturnType<typeof qdssFixture>>) =>
		f.m.tx as unknown as Prisma.TransactionClient;
	it('should preserve real zero-valued profile fields and authored factors without fallback', async () => {
		const state = await f.snapshots.capture(db(f), f.groupId);
		expect(state.snapshot.contributors).toHaveLength(5);
		expect(state.snapshot.contributors[0].provenance).toMatchObject({
			profile: ['MASTER', 0, 0, 0],
		});
	});
	it('should exclude invalid contributors before forming the numerical input and require four remaining', async () => {
		f.m.groups.state.experts[1].profileValidatedAt = null;
		expect(
			(await f.snapshots.capture(db(f), f.groupId)).snapshot.contributors,
		).toHaveLength(4);
		f.m.groups.state.experts[2].credentialSuspendedAt = new Date();
		await expect(
			f.snapshots.capture(db(f), f.groupId),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should reject corrupt custom data rather than silently inheriting global samples', async () => {
		await f.calibration.replace(
			groupUserId(1),
			f.groupId,
			await datasetSubmission(f, groupUserId(1), f.groupId),
		);
		f.m.state.datasets[1].sampleCount = 19;
		await expect(
			f.snapshots.capture(db(f), f.groupId),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
	it('should resolve explicit global sample revisions without sharing global reference contributors with a group', async () => {
		const a = await f.snapshots.capture(db(f), null),
			b = await f.snapshots.capture(db(f), f.groupId);
		expect(a.snapshot.referenceId).not.toBeNull();
		expect(b.snapshot.referenceId).toBeNull();
		expect(
			b.snapshot.contributors.every(
				(c) => !c.id.startsWith('reference-'),
			),
		).toBe(true);
	});
	it('should preserve old global sample pinning when global selected revision changes', async () => {
		const first = await f.snapshots.capture(db(f), f.groupId);
		await f.calibration.replace(
			qdssAdmin,
			null,
			await datasetSubmission(f, qdssAdmin, null, 25),
		);
		expect(
			(
				await f.snapshots.capture(
					db(f),
					f.groupId,
					first.snapshot.datasetId,
				)
			).inputHash,
		).toBe(first.inputHash);
		expect(
			(await f.snapshots.capture(db(f), f.groupId)).inputHash,
		).not.toBe(first.inputHash);
	});
	it('should reject malformed reference storage and keep catalogue failures fail closed', async () => {
		f.m.state.references[0].sourceHash = 'other';
		await expect(f.snapshots.capture(db(f), null)).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
	});
});
