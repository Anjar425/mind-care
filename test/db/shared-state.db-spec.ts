import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ApiRateLimitGuard } from '../../src/api/common/rate-limit/api-rate-limit.guard';
import { RateLimit } from '../../src/api/common/rate-limit/rate-limit.decorator';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { JobLeaseService } from '../../src/infrastructure/prisma/job-lease.service';
import { PostgresThrottlerStorage } from '../../src/infrastructure/rate-limit/postgres-throttler.storage';
import { barrier, createPrisma, dbConfig, resetData, sleep } from './support';

// State that must be shared by every API instance. Each "instance" below has its own
// PrismaService (its own connection pool), exactly like two containers would.
describe('Multi-instance shared state on PostgreSQL', () => {
	let a: PrismaService;
	let b: PrismaService;

	beforeAll(() => {
		a = createPrisma();
		b = createPrisma();
	});
	beforeEach(() => resetData(a));
	afterAll(async () => {
		await a.$disconnect();
		await b.$disconnect();
	});

	describe('rate-limit store', () => {
		it('3A-1: counts hits from two instances against one quota', async () => {
			const one = new PostgresThrottlerStorage(a);
			const two = new PostgresThrottlerStorage(b);
			const results: Awaited<
				ReturnType<PostgresThrottlerStorage['increment']>
			>[] = [];
			for (let i = 0; i < 6; i++)
				results.push(
					await (i % 2 ? two : one).increment('k', 60000, 5, 60000),
				);
			expect(results.map((r) => r.isBlocked)).toEqual([
				false,
				false,
				false,
				false,
				false,
				true,
			]);
			expect(results[5].timeToBlockExpire).toBeGreaterThan(0);
		});

		it('3A-1: never over-admits under concurrent hits', async () => {
			const stores = [
				new PostgresThrottlerStorage(a),
				new PostgresThrottlerStorage(b),
			];
			const results = await Promise.all(
				Array.from({ length: 20 }, (_, i) =>
					stores[i % 2].increment('burst', 60000, 10, 60000),
				),
			);
			expect(results.filter((r) => !r.isBlocked)).toHaveLength(10);
			expect(
				results.map((r) => r.totalHits).sort((x, y) => x - y),
			).toEqual([
				...Array.from({ length: 11 }, (_, i) => i + 1),
				...Array<number>(9).fill(11),
			]);
		});

		it('3A-1: opens a new window and lifts a block once they expire, then purges', async () => {
			const store = new PostgresThrottlerStorage(a);
			await store.increment('w', 300, 1, 300);
			expect((await store.increment('w', 300, 1, 300)).isBlocked).toBe(
				true,
			);
			await sleep(400);
			const reopened = await store.increment('w', 300, 1, 300);
			expect(reopened).toMatchObject({ isBlocked: false, totalHits: 1 });
			await sleep(400);
			expect(await store.purgeExpired()).toBe(1);
			expect(await a.rateLimitBucket.count()).toBe(0);
		});

		it('3A-2: enforces the per-account login limit across instances and IPs', async () => {
			const guards = [a, b].map(
				(prisma) =>
					new ApiRateLimitGuard(
						new PostgresThrottlerStorage(prisma),
						dbConfig({
							RATE_LIMIT_LOGIN: 1000,
							RATE_LIMIT_LOGIN_ACCOUNT: 3,
						}),
						new Reflector(),
					),
			);
			const handler = () => undefined;
			RateLimit('login')(handler, 'login', { value: handler });
			const attempt = (i: number) =>
				guards[i % 2].canActivate({
					getHandler: () => handler,
					switchToHttp: () => ({
						getRequest: () => ({
							ip: `203.0.113.${i}`,
							body: { email: 'target@example.test' },
							socket: {},
						}),
						getResponse: () =>
							({
								setHeader: () => undefined,
							}) as unknown as Response,
					}),
				} as unknown as ExecutionContext);
			for (let i = 0; i < 3; i++) await attempt(i);
			await expect(attempt(3)).rejects.toThrow('Too many requests');
		});
	});

	describe('job lease', () => {
		it('3A-3: lets exactly one of two concurrent instances run a job', async () => {
			const gate = barrier(2);
			let runs = 0;
			const work = async () => {
				runs += 1;
				await sleep(200);
			};
			const results = await Promise.all(
				[a, b].map(async (prisma) => {
					await gate.arrive();
					return new JobLeaseService(prisma).run(
						'maintenance',
						60000,
						work,
					);
				}),
			);
			expect(results.filter(Boolean)).toHaveLength(1);
			expect(runs).toBe(1);
			// Released on completion: the next tick runs again.
			expect(
				await new JobLeaseService(b).run('maintenance', 60000, work),
			).toBe(true);
		});

		it('3A-3: takes over a lease whose holder died, and releases it after a failure', async () => {
			await a.jobLease.create({
				data: {
					name: 'maintenance',
					holder: 'crashed-instance',
					leaseUntil: new Date(Date.now() - 1000),
				},
			});
			const leases = new JobLeaseService(b);
			jest.spyOn(Logger.prototype, 'warn').mockImplementation(
				() => undefined,
			);
			await expect(
				leases.run('maintenance', 60000, () =>
					Promise.reject(new Error('job failed')),
				),
			).rejects.toThrow('job failed');
			expect(await leases.run('maintenance', 60000, async () => {})).toBe(
				true,
			);
		});
	});
});
