import { ReferenceSeedService } from '../../src/domain/reference-data/reference-seed.service';
import { ReferenceSeedError } from '../../src/domain/reference-data/reference-data.types';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { createPrisma, resetData } from './support';

describe('Reference seeding on PostgreSQL', () => {
	let prisma: PrismaService;
	let seeder: ReferenceSeedService;

	beforeAll(() => {
		prisma = createPrisma();
		seeder = new ReferenceSeedService(prisma);
	});
	afterAll(async () => {
		// Leave the catalogs seeded for later spec files.
		await seeder.run(true);
		await prisma.$disconnect();
	});

	const counts = async () => ({
		dass21: await prisma.dASS21.count(),
		dass42: await prisma.dASS42.count(),
		conclusions: await prisma.conclusion.count(),
	});

	it('D7: re-applying an already seeded catalog inserts nothing', async () => {
		const before = await counts();
		const report = await seeder.run(true);
		expect(report.mode).toBe('apply');
		expect(report.inserted).toBe(0);
		expect(await counts()).toEqual(before);
	});

	it('D7: concurrent applies on empty catalogs insert every row exactly once', async () => {
		const expected = await counts();
		await resetData(prisma);
		await prisma.$executeRawUnsafe(
			'TRUNCATE TABLE "DASS21", "DASS42", "Conclusion" RESTART IDENTITY CASCADE',
		);

		const results = await Promise.allSettled([
			seeder.run(true),
			seeder.run(true),
		]);

		const inserted = results
			.filter((r) => r.status === 'fulfilled')
			.map((r) => r.value.inserted);
		for (const result of results)
			if (result.status === 'rejected') {
				expect(result.reason).toBeInstanceOf(ReferenceSeedError);
				expect((result.reason as ReferenceSeedError).code).toBe(
					'CONCURRENT_CHANGE',
				);
			}
		expect(inserted.reduce((a, b) => a + b, 0)).toBe(
			expected.dass21 + expected.dass42 + expected.conclusions,
		);
		expect(await counts()).toEqual(expected);
	});
});
