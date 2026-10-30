import type {
	CredentialRevision,
	Prisma,
} from '../src/prisma/generated/client';

export const ownerId = '123e4567-e89b-42d3-a456-426614174001';
export const expertId = '123e4567-e89b-42d3-a456-426614174002';
export const revisionId = '123e4567-e89b-42d3-a456-426614174003';
export const adminId = '123e4567-e89b-42d3-a456-426614174004';
export const credentialUser = () => ({
	id: ownerId,
	name: 'Example Expert',
	role: 'EXPERT' as const,
	email: 'synthetic@example.test',
	email_verified_at: new Date('2026-01-01'),
});
export const credentialExpert = () => ({
	id: expertId,
	userId: ownerId,
	credentialVersion: 1,
	credentialSuspendedAt: null as Date | null,
	user: credentialUser(),
	credentialRevisions: (['STR', 'SIP'] as const).map((type) => ({
		type,
		status: 'APPROVED' as const,
		holderName: 'Example Expert',
		expiresAt: new Date('2090-01-01'),
	})),
});
export const credentialRevision = (): CredentialRevision => ({
	id: revisionId,
	expertId,
	identityId: 'identity',
	type: 'STR',
	status: 'PENDING',
	numberCipher: 'encrypted-number',
	holderName: 'Example Expert',
	expiresAt: new Date('2090-01-01T17:00:00Z'),
	expiryDate: '2090-01-01',
	objectKey: `${revisionId}.bin`,
	digest: 'a'.repeat(64),
	mime: 'application/pdf',
	size: 14,
	submittedAt: new Date('2026-10-30'),
	reviewedAt: null,
	reviewerId: null,
	reason: null,
	purgeAfter: null,
	purgedAt: null,
	issuerVerification: 'NOT_CHECKED',
});

export function createCredentialMocks() {
	const expert = credentialExpert();
	const row = { ...credentialRevision(), expert };
	const prisma = {
		user: {
			findUnique: jest.fn(({ where }: { where: { id: string } }) =>
				Promise.resolve(
					where.id === adminId
						? { ...credentialUser(), id: adminId, role: 'ADMIN' }
						: credentialUser(),
				),
			),
		},
		expert: {
			findUnique: jest.fn().mockResolvedValue(expert),
			findUniqueOrThrow: jest.fn().mockResolvedValue(expert),
			upsert: jest.fn().mockResolvedValue(expert),
			update: jest
				.fn()
				.mockResolvedValue({ ...expert, credentialVersion: 2 }),
		},
		credentialRevision: {
			findMany: jest.fn().mockResolvedValue([row]),
			findFirst: jest.fn().mockResolvedValue(null),
			findUnique: jest.fn().mockResolvedValue(row),
			findUniqueOrThrow: jest.fn().mockResolvedValue(row),
			create: jest.fn().mockResolvedValue(row),
			update: jest.fn().mockResolvedValue(row),
			updateMany: jest.fn().mockResolvedValue({ count: 1 }),
		},
		credentialIdentity: {
			findUnique: jest.fn().mockResolvedValue(null),
			create: jest.fn().mockResolvedValue({ id: 'identity', expertId }),
		},
		credentialAudit: { create: jest.fn().mockResolvedValue({}) },
		credentialReminder: {
			create: jest.fn().mockResolvedValue({}),
			findMany: jest.fn().mockResolvedValue([]),
			updateMany: jest.fn().mockResolvedValue({ count: 1 }),
		},
		$queryRaw: jest.fn().mockResolvedValue([]),
		$transaction: jest.fn(
			(
				work: (tx: Prisma.TransactionClient) => Promise<unknown>,
			): Promise<unknown> =>
				work(prisma as unknown as Prisma.TransactionClient),
		),
	};
	const objectMetadata = {
		objectKey: row.objectKey,
		mime: row.mime,
		size: row.size,
		digest: row.digest,
	};
	const storage = {
		lookup: jest.fn().mockReturnValue('protected-index'),
		validate: jest.fn(),
		seal: jest.fn().mockReturnValue('encrypted-number'),
		open: jest.fn().mockReturnValue(Buffer.from('STR-123')),
		put: jest.fn().mockResolvedValue(objectMetadata),
		read: jest.fn().mockResolvedValue(Buffer.from('%PDF-synthetic')),
		remove: jest.fn().mockResolvedValue(undefined),
		orphanCandidates: jest.fn().mockResolvedValue([]),
	};
	const eligibility = {
		find: jest.fn().mockResolvedValue(expert),
		require: jest.fn().mockResolvedValue(expert),
		check: jest
			.fn()
			.mockResolvedValue({ credentialEligible: true, reasons: [] }),
	};
	return { prisma, storage, eligibility, expert, row };
}
