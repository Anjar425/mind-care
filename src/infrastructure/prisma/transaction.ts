import {
	ConflictException,
	HttpException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from './generated/client';
import type { PrismaService } from './prisma.service';

/**
 * How a domain runs its interactive transactions. Each domain keeps its own preset next to
 * its persistence helpers so that isolation, retries and client-facing wording stay explicit.
 */
export interface TransactionPolicy {
	isolation: 'Serializable' | 'RepeatableRead';
	/** Total attempts while a `conflictCodes` error occurs. Default 1 (no retry). */
	attempts?: number;
	/** Prisma error codes reported as 409 once the attempts are exhausted. */
	conflictCodes: readonly string[];
	conflictMessage: string;
	/** 503 message for every other non-HTTP failure. Omitted: the original error propagates. */
	unavailableMessage?: string;
}

/** Prisma write conflicts: unique violation (P2002) and serialization failure (P2034). */
export const WRITE_CONFLICT_CODES = ['P2002', 'P2034'] as const;

export function hasDatabaseCode(error: unknown, code: string): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === code
	);
}

export async function withTransaction<T>(
	prisma: PrismaService,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
	policy: TransactionPolicy,
): Promise<T> {
	const attempts = policy.attempts ?? 1;
	for (let attempt = 1; ; attempt++) {
		try {
			return await prisma.$transaction(work, {
				isolationLevel: policy.isolation,
			});
		} catch (error: unknown) {
			if (error instanceof HttpException) throw error;
			const conflict = policy.conflictCodes.some((code) =>
				hasDatabaseCode(error, code),
			);
			if (conflict && attempt < attempts) continue;
			if (conflict) throw new ConflictException(policy.conflictMessage);
			if (policy.unavailableMessage === undefined) throw error;
			throw new ServiceUnavailableException(policy.unavailableMessage);
		}
	}
}
