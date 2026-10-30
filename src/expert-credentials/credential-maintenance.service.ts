import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialStorageService } from './credential-storage.service';
import { DAY_MS } from './credential-policy';
import type { RuntimeEnvironment } from '../common/config/environment.config';

@Injectable()
export class CredentialMaintenanceService {
	private readonly logger = new Logger(CredentialMaintenanceService.name);
	private running = false;
	constructor(
		private readonly prisma: PrismaService,
		private readonly mail: MailService,
		private readonly storage: CredentialStorageService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}
	@Cron('0 * * * * *', {
		name: 'credential-maintenance',
		waitForCompletion: true,
	})
	async tick() {
		if (this.running) return;
		this.running = true;
		try {
			await this.purge();
			await this.reconcile();
			const hour = Number(
				new Intl.DateTimeFormat('en-GB', {
					timeZone: 'Asia/Jakarta',
					hour: '2-digit',
					hourCycle: 'h23',
				}).format(new Date()),
			);
			if (
				hour ===
				this.config.get('CREDENTIAL_REMINDER_HOUR', { infer: true })
			)
				await this.remind();
		} catch {
			this.logger.warn(
				'Credential maintenance incomplete; retry scheduled',
			);
		} finally {
			this.running = false;
		}
	}
	async purge(now = new Date()) {
		const rows = await this.prisma.credentialRevision.findMany({
			where: {
				status: { in: ['REJECTED', 'SUPERSEDED'] },
				purgeAfter: { lte: now },
				purgedAt: null,
			},
			take: 100,
			orderBy: { purgeAfter: 'asc' },
		});
		for (const row of rows) {
			await this.storage.remove(row.objectKey);
			await this.prisma.credentialRevision.updateMany({
				where: {
					id: row.id,
					purgedAt: null,
					status: { in: ['REJECTED', 'SUPERSEDED'] },
				},
				data: { purgedAt: now },
			});
		}
	}
	async reconcile(now = new Date()) {
		for (const key of await this.storage.orphanCandidates(
			new Date(now.getTime() - DAY_MS),
		)) {
			if (
				!(await this.prisma.credentialRevision.findUnique({
					where: { objectKey: key },
					select: { id: true },
				}))
			)
				await this.storage.remove(key);
		}
	}
	async remind(now = new Date()) {
		const lead = this.config.get('CREDENTIAL_REMINDER_LEAD_DAYS', {
			infer: true,
		});
		const rows = await this.prisma.credentialReminder.findMany({
			where: {
				deliveredAt: null,
				attempts: { lt: 5 },
				OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
				revision: {
					status: 'APPROVED',
					expiresAt: {
						gt: now,
						lte: new Date(now.getTime() + lead * DAY_MS),
					},
				},
			},
			include: {
				revision: { include: { expert: { include: { user: true } } } },
			},
			orderBy: { id: 'asc' },
			take: 100,
		});
		for (const row of rows) {
			const lease = new Date(now.getTime() + 120000);
			const claim = await this.prisma.credentialReminder.updateMany({
				where: {
					id: row.id,
					deliveredAt: null,
					attempts: { lt: 5 },
					OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
				},
				data: { leaseUntil: lease, attempts: { increment: 1 } },
			});
			if (claim.count !== 1) continue;
			const current = await this.prisma.credentialRevision.findUnique({
				where: { id: row.revisionId },
				include: { expert: { include: { user: true } } },
			});
			if (
				!current ||
				current.status !== 'APPROVED' ||
				current.expiresAt <= new Date() ||
				current.expert.user.role !== 'EXPERT' ||
				!current.expert.user.email_verified_at
			) {
				await this.prisma.credentialReminder.updateMany({
					where: { id: row.id, leaseUntil: lease },
					data: {
						lastFailure: 'NO_LONGER_ELIGIBLE',
						leaseUntil: null,
						attempts: 5,
					},
				});
				continue;
			}
			try {
				await this.mail.sendCredentialExpiryReminder(
					current.expert.user.email,
					current.type,
					current.expiryDate,
				);
				await this.prisma.credentialReminder.updateMany({
					where: { id: row.id, leaseUntil: lease },
					data: {
						deliveredAt: new Date(),
						leaseUntil: null,
						lastFailure: null,
					},
				});
			} catch {
				await this.prisma.credentialReminder.updateMany({
					where: { id: row.id, leaseUntil: lease },
					data: {
						lastFailure: 'DELIVERY_FAILED',
						leaseUntil: new Date(Date.now() + DAY_MS),
					},
				});
				this.logger.warn(
					'Credential reminder delivery failed; bounded retry scheduled',
				);
			}
		}
	}
}
