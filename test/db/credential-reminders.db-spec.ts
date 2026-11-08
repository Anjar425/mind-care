import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { CredentialMaintenanceJob } from '../../src/jobs/credential-maintenance.job';
import type { CredentialStorageService } from '../../src/domain/credentials/credential-storage.service';
import type { MailService } from '../../src/infrastructure/mail/mail.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { JobLeaseService } from '../../src/infrastructure/prisma/job-lease.service';
import { PostgresThrottlerStorage } from '../../src/infrastructure/rate-limit/postgres-throttler.storage';
import { createPrisma, createUser, dbConfig, resetData } from './support';

const DAY = 24 * 60 * 60 * 1000;

describe('Credential expiry reminders on PostgreSQL', () => {
	let prisma: PrismaService;
	const storage = {} as CredentialStorageService;

	beforeAll(() => {
		prisma = createPrisma();
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	async function approvedRevisionWithReminder() {
		const user = await createUser(prisma, {
			role: 'EXPERT',
			name: 'Siti Rahma, S.Psi.',
		});
		const expert = await prisma.expert.create({
			data: { userId: user.id },
		});
		const identity = await prisma.credentialIdentity.create({
			data: { type: 'STR', lookup: randomUUID(), expertId: expert.id },
		});
		const expiresAt = new Date(Date.now() + 10 * DAY);
		const revision = await prisma.credentialRevision.create({
			data: {
				expertId: expert.id,
				identityId: identity.id,
				type: 'STR',
				status: 'APPROVED',
				numberCipher: 'synthetic-cipher',
				holderName: user.name,
				expiresAt,
				expiryDate: expiresAt.toISOString().slice(0, 10),
				objectKey: randomUUID(),
				digest: 'synthetic-digest',
				mime: 'application/pdf',
				size: 1,
				reviewedAt: new Date(),
			},
		});
		const reminder = await prisma.credentialReminder.create({
			data: { revisionId: revision.id },
		});
		return { user, reminder };
	}

	function maintenance(send: jest.Mock) {
		return new CredentialMaintenanceJob(
			prisma,
			{ sendCredentialExpiryReminder: send } as unknown as MailService,
			storage,
			dbConfig(),
			new JobLeaseService(prisma),
			new PostgresThrottlerStorage(prisma),
		);
	}

	it('D5: concurrent workers deliver each reminder exactly once', async () => {
		const { user, reminder } = await approvedRevisionWithReminder();
		const send = jest.fn().mockResolvedValue(undefined);

		await Promise.all([
			maintenance(send).remind(),
			maintenance(send).remind(),
		]);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(
			user.email,
			'STR',
			expect.any(String),
		);
		const stored = await prisma.credentialReminder.findUniqueOrThrow({
			where: { id: reminder.id },
		});
		expect(stored.deliveredAt).not.toBeNull();
		expect(stored.attempts).toBe(1);
		expect(stored.leaseUntil).toBeNull();
	});

	it('D5: a delivery failure keeps the reminder pending with a bounded retry lease', async () => {
		const { reminder } = await approvedRevisionWithReminder();
		const send = jest.fn().mockRejectedValue(new Error('smtp down'));
		// The simulated SMTP failure is expected; capture the warning instead of printing it.
		const warn = jest
			.spyOn(Logger.prototype, 'warn')
			.mockImplementation(() => undefined);

		await maintenance(send).remind();

		expect(warn).toHaveBeenCalledWith(
			'Credential reminder delivery failed; bounded retry scheduled',
		);
		warn.mockRestore();

		const stored = await prisma.credentialReminder.findUniqueOrThrow({
			where: { id: reminder.id },
		});
		expect(stored.deliveredAt).toBeNull();
		expect(stored.lastFailure).toBe('DELIVERY_FAILED');
		expect(stored.leaseUntil!.getTime()).toBeGreaterThan(
			Date.now() + DAY - 60_000,
		);
		const retry = jest.fn().mockResolvedValue(undefined);
		await maintenance(retry).remind();
		expect(retry).not.toHaveBeenCalled();
	});
});
