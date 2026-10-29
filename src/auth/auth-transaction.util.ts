import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '@/prisma/prisma.service';
import type { Prisma } from '@/prisma/generated/client';

export function hasDatabaseCode(error: unknown, code: string): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === code
	);
}

export async function authTransaction<T>(
	prisma: PrismaService,
	operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await prisma.$transaction(operation, {
				isolationLevel: 'Serializable',
			});
		} catch (error: unknown) {
			if (!hasDatabaseCode(error, 'P2034')) throw error;
		}
	}
	throw new ConflictException(
		'Account changed concurrently; retry the request',
	);
}
