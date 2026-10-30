import {
	ConflictException,
	HttpException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

export async function credentialTransaction<T>(
	prisma: PrismaService,
	work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	try {
		return await prisma.$transaction(work, {
			isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
		});
	} catch (error) {
		if (error instanceof HttpException) throw error;
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			['P2002', 'P2034'].includes(error.code)
		)
			throw new ConflictException(
				'Concurrent change or credential identity conflict; reload and retry',
			);
		throw new ServiceUnavailableException(
			'Credential persistence is unavailable',
		);
	}
}

export async function lockCredentialOwner(
	tx: Prisma.TransactionClient,
	userId: string,
) {
	await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}
