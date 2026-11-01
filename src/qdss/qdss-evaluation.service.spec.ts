import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client';
import { qdssFixture } from '../../test/qdss-mocks';
import { groupUserId } from '../../test/groups-mocks';
import { SystemRandom } from './math/ga';
describe('Internal QDSS current model consumption', () => {
	let f: Awaited<ReturnType<typeof qdssFixture>>;
	beforeEach(async () => {
		f = await qdssFixture();
		jest.spyOn(SystemRandom.prototype, 'uniform').mockReturnValue(0.5);
	});
	afterEach(() => jest.restoreAllMocks());
	const answers = () =>
		Array.from({ length: 21 }, (_, i) => ({
			dass21Id: `DASS21-Q${String(i + 1).padStart(2, '0')}`,
			score: 1,
		}));
	it('should not calibrate automatically or invent a model for an assessment', async () => {
		await expect(
			f.evaluation.evaluate(f.groupId, answers()),
		).rejects.toBeInstanceOf(ConflictException);
		expect(f.m.state.runs).toHaveLength(0);
	});
	it('should compute a current snapshot with disclaimer and no patient/history writes', async () => {
		await f.models.recalibrate(
			groupUserId(1),
			f.groupId,
			(await f.models.read(groupUserId(1), f.groupId)).nextInputHash!,
		);
		const before = structuredClone(f.m.state);
		const result = await f.evaluation.evaluate(f.groupId, answers());
		expect(result.disclaimer).toContain('not a medical diagnosis');
		expect(
			result.result.depression +
				result.result.anxiety +
				result.result.stress,
		).toBeCloseTo(1, 12);
		expect(f.m.state).toEqual(before);
	});
	it('should reuse the caller transaction and retain source all-zero result behavior', async () => {
		await f.models.recalibrate(
			groupUserId(1),
			f.groupId,
			(await f.models.read(groupUserId(1), f.groupId)).nextInputHash!,
		);
		f.m.transaction.mockClear();
		const result = await f.evaluation.evaluate(
			f.groupId,
			answers().map((a) => ({ ...a, score: 0 })),
			f.m.tx as unknown as Prisma.TransactionClient,
		);
		expect(result.result.copyHistoryLabel).toBeNull();
		expect(f.m.transaction).not.toHaveBeenCalled();
	});
});
