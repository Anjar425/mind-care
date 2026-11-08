import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';

/**
 * Single-runner guard for scheduled work across API instances. A lease row (not an advisory
 * lock) is used because pooled connections cannot keep a session lock, and a transaction
 * held open for the whole job would be cut by idle_in_transaction_session_timeout.
 */
@Injectable()
export class JobLeaseService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Runs `work` only if this caller obtains the lease for `name`; otherwise skips and
	 * returns `false`. The lease expires on its own after `leaseMs` if the holder dies.
	 */
	async run(
		name: string,
		leaseMs: number,
		work: () => Promise<void>,
	): Promise<boolean> {
		const holder = randomUUID();
		const acquired = await this.prisma.$queryRaw<{ holder: string }[]>`
			INSERT INTO "JobLease" ("name", "holder", "leaseUntil")
			VALUES (${name}, ${holder}, now() + ${leaseMs}::integer * INTERVAL '1 millisecond')
			ON CONFLICT ("name") DO UPDATE
			SET "holder" = EXCLUDED."holder", "leaseUntil" = EXCLUDED."leaseUntil"
			WHERE "JobLease"."leaseUntil" <= now()
			RETURNING "holder"`;
		if (acquired[0]?.holder !== holder) return false;
		try {
			await work();
		} finally {
			await this.prisma.$executeRaw`
				UPDATE "JobLease" SET "leaseUntil" = now()
				WHERE "name" = ${name} AND "holder" = ${holder}`;
		}
		return true;
	}
}
