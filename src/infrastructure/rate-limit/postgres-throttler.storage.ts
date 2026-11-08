import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

type ThrottlerStorageRecord = Awaited<
	ReturnType<ThrottlerStorage['increment']>
>;

interface HitRow {
	total_hits: number;
	time_to_expire: number;
	is_blocked: boolean;
	time_to_block_expire: number;
}

/**
 * Rate-limit counters shared by every API instance, stored in the UNLOGGED "RateLimitBucket"
 * table. Each hit is one atomic rate_limit_hit() call (see the 20261108090100 migration).
 * Keys arrive already hashed; no IP or email is stored.
 */
@Injectable()
export class PostgresThrottlerStorage implements ThrottlerStorage {
	constructor(private readonly prisma: PrismaService) {}

	async increment(
		key: string,
		ttl: number,
		limit: number,
		blockDuration: number,
	): Promise<ThrottlerStorageRecord> {
		const [row] = await this.prisma.$queryRaw<HitRow[]>`
			SELECT * FROM rate_limit_hit(${key}, ${ttl}::integer, ${limit}::integer, ${blockDuration}::integer)`;
		if (!row) throw new Error('Rate-limit store returned no row');
		return {
			totalHits: row.total_hits,
			timeToExpire: row.time_to_expire,
			isBlocked: row.is_blocked,
			timeToBlockExpire: row.time_to_block_expire,
		};
	}

	/** Deletes buckets whose window and block have both ended. Returns the number removed. */
	purgeExpired(now = new Date()): Promise<number> {
		return this.prisma.rateLimitBucket
			.deleteMany({
				where: {
					windowEndsAt: { lte: now },
					OR: [
						{ blockedUntil: null },
						{ blockedUntil: { lte: now } },
					],
				},
			})
			.then((result) => result.count);
	}
}
