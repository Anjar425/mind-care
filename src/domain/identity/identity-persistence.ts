import type { TransactionPolicy } from '../../infrastructure/prisma/transaction';

// Account and session writes retry serialization failures; any other database error
// propagates unchanged so callers can map it (e.g. a duplicate email on registration).
export const IDENTITY_TX: TransactionPolicy = {
	isolation: 'Serializable',
	attempts: 3,
	conflictCodes: ['P2034'],
	conflictMessage: 'Account changed concurrently; retry the request',
};
