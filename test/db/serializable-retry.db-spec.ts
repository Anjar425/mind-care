import {
	withTransaction,
	hasDatabaseCode,
} from '../../src/infrastructure/prisma/transaction';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { barrier, createPrisma, createUser, resetData } from './support';
import { IDENTITY_TX } from '../../src/domain/identity/identity-persistence';

// Every *Transaction helper in src/ relies on the pg driver adapter surfacing
// PostgreSQL serialization failures (40001) as Prisma code P2034.
describe('Serializable conflicts on PostgreSQL', () => {
	let prisma: PrismaService;

	beforeAll(() => {
		prisma = createPrisma();
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	async function appendToName(
		tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
		userId: string,
		suffix: string,
		gate: ReturnType<typeof barrier>,
	) {
		const current = await tx.user.findUniqueOrThrow({
			where: { id: userId },
		});
		await gate.arrive();
		await tx.user.update({
			where: { id: userId },
			data: { name: current.name + suffix },
		});
	}

	it('D9a: a read-then-write race surfaces as P2034 without the retry helper', async () => {
		const user = await createUser(prisma, { name: 'x' });
		const gate = barrier(2);
		const run = (suffix: string) =>
			prisma.$transaction(
				(tx) => appendToName(tx, user.id, suffix, gate),
				{ isolationLevel: 'Serializable' },
			);

		const results = await Promise.allSettled([run('a'), run('b')]);

		const rejected = results.filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected',
		);
		expect(rejected).toHaveLength(1);
		expect(hasDatabaseCode(rejected[0].reason, 'P2034')).toBe(true);
	});

	it('D9b: the bounded retry helper re-runs the loser so no update is lost', async () => {
		const user = await createUser(prisma, { name: 'x' });
		const gate = barrier(2);
		const run = (suffix: string) =>
			withTransaction(
				prisma,
				(tx) => appendToName(tx, user.id, suffix, gate),
				IDENTITY_TX,
			);

		await expect(Promise.all([run('a'), run('b')])).resolves.toBeDefined();

		const stored = await prisma.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(['xab', 'xba']).toContain(stored.name);
	});
});
