import { Prisma } from '../../infrastructure/prisma/generated/client';
import {
	WRITE_CONFLICT_CODES,
	type TransactionPolicy,
} from '../../infrastructure/prisma/transaction';

export const CREDENTIAL_TX: TransactionPolicy = {
	isolation: 'Serializable',
	conflictCodes: WRITE_CONFLICT_CODES,
	conflictMessage:
		'Concurrent change or credential identity conflict; reload and retry',
	unavailableMessage: 'Credential persistence is unavailable',
};

export async function lockCredentialOwner(
	tx: Prisma.TransactionClient,
	userId: string,
) {
	await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}
