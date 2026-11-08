import { lockGroup } from '../../src/domain/groups/group-persistence';
import { lockConfiguration } from '../../src/domain/qdss/qdss-persistence';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { createPrisma, createUser, resetData, sleep } from './support';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// Lock primitives behind rule, group-governance and QDSS writes (FOR UPDATE on User/Group rows,
// pg_advisory_xact_lock per QDSS configuration). Service-level races are covered separately.
describe('Row and advisory locks on PostgreSQL', () => {
	let prisma: PrismaService;

	beforeAll(() => {
		prisma = createPrisma();
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	async function holdThenRace(
		lock: (tx: Tx) => Promise<void>,
		otherLock: (tx: Tx) => Promise<void> = lock,
	) {
		const events: string[] = [];
		let firstLocked!: () => void;
		const locked = new Promise<void>((resolve) => (firstLocked = resolve));
		const first = prisma.$transaction(async (tx) => {
			await lock(tx);
			events.push('first-locked');
			firstLocked();
			await sleep(400);
			events.push('first-releasing');
		});
		await locked;
		const startedWaiting = Date.now();
		let waitedMs = 0;
		const second = prisma.$transaction(async (tx) => {
			await otherLock(tx);
			waitedMs = Date.now() - startedWaiting;
			events.push('second-locked');
		});
		await Promise.all([first, second]);
		return { events, waitedMs };
	}

	it('D3/D6: lockGroup serializes writers of the same group and user rows', async () => {
		const user = await createUser(prisma, { role: 'EXPERT' });
		const group = await prisma.group.create({
			data: { name: 'Lock group', description: 'Lock test' },
		});

		const { events, waitedMs } = await holdThenRace((tx) =>
			lockGroup(tx, [user.id], group.id),
		);

		expect(events).toEqual([
			'first-locked',
			'first-releasing',
			'second-locked',
		]);
		expect(waitedMs).toBeGreaterThanOrEqual(250);
	});

	it('D4: lockConfiguration serializes calibrations of the same QDSS configuration', async () => {
		const { events, waitedMs } = await holdThenRace((tx) =>
			lockConfiguration(tx, [], null),
		);

		expect(events).toEqual([
			'first-locked',
			'first-releasing',
			'second-locked',
		]);
		expect(waitedMs).toBeGreaterThanOrEqual(250);
	});

	it('D4: different QDSS configurations do not block each other', async () => {
		const group = await prisma.group.create({
			data: { name: 'Other group', description: 'Lock test' },
		});

		const { events, waitedMs } = await holdThenRace(
			(tx) => lockConfiguration(tx, [], null),
			(tx) => lockConfiguration(tx, [], group.id),
		);

		expect(events).toEqual([
			'first-locked',
			'second-locked',
			'first-releasing',
		]);
		expect(waitedMs).toBeLessThan(250);
	});
});
