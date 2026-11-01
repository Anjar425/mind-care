import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { RuleReferenceService } from './rule-reference.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { createRulesMocks, validRuleContent } from '../../test/rules-mocks';
import type { Prisma } from '../prisma/generated/client';
describe('Rule reference boundary', () => {
	it('should allow cross-category questions and resolve actual existing conclusion within the supplied transaction', async () => {
		const m = createRulesMocks();
		const service = new RuleReferenceService(
			new ReferenceDataService(m.prisma),
		);
		const result = await service.resolve(
			validRuleContent(),
			m.tx as unknown as Prisma.TransactionClient,
		);
		expect(result).toBeGreaterThan(0);
		expect(m.tx.dASS42.findMany).toHaveBeenCalledTimes(1);
		expect(m.transaction).not.toHaveBeenCalled();
	});
	it('should reject stale authored release instead of assigning current meaning silently', async () => {
		const m = createRulesMocks();
		const service = new RuleReferenceService(
			new ReferenceDataService(m.prisma),
		);
		await expect(
			service.resolve(
				{ ...validRuleContent(), catalogVersion: 'old' },
				m.tx as unknown as Prisma.TransactionClient,
			),
		).rejects.toBeInstanceOf(ConflictException);
	});
	it('should fail closed for missing declared-valid conclusions without seeding or numeric fallback', async () => {
		const m = createRulesMocks();
		m.state.conclusions = [];
		const service = new RuleReferenceService(
			new ReferenceDataService(m.prisma),
		);
		await expect(
			service.resolve(
				validRuleContent(),
				m.tx as unknown as Prisma.TransactionClient,
			),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});
});
