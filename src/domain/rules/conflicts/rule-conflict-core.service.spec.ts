import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../../infrastructure/prisma/generated/client';
import {
	fillInferenceRules,
	inferenceFixture,
} from '../../../../test/dass42-inference-mocks';

describe('Inference-only source capacity without partial governance scans', () => {
	it('should reject overflow before decoding the excess while keeping default governance complete', async () => {
		const f = await inferenceFixture();
		fillInferenceRules(f, 205);
		const tx = f.m.tx as unknown as Prisma.TransactionClient;
		const decode = jest.spyOn(f.store, 'decode');
		f.m.tx.rule.findMany.mockClear();
		await expect(
			f.core.snapshot(tx, f.groupId, undefined, 2),
		).rejects.toBeInstanceOf(ConflictException);
		expect(decode).not.toHaveBeenCalled();
		expect(f.m.tx.rule.findMany.mock.calls[0][0].take).toBe(3);
		expect((await f.core.snapshot(tx, f.groupId)).inputs).toHaveLength(205);
	});
	it('should accept an exact boundary and query a single sentinel before returning all records', async () => {
		const f = await inferenceFixture();
		const tx = f.m.tx as unknown as Prisma.TransactionClient;
		f.m.tx.rule.findMany.mockClear();
		expect(
			(await f.core.snapshot(tx, f.groupId, undefined, 3)).inputs,
		).toHaveLength(3);
		expect(f.m.tx.rule.findMany.mock.calls[0][0].take).toBe(4);
	});
	it.each([0, -1, 1.5, Infinity, NaN])(
		'should reject invalid internal source capacity %s',
		async (cap) => {
			const f = await inferenceFixture();
			await expect(
				f.core.snapshot(
					f.m.tx as unknown as Prisma.TransactionClient,
					f.groupId,
					undefined,
					cap,
				),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
});
