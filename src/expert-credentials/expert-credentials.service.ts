import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialStorageService } from './credential-storage.service';
import { CredentialEligibilityService } from './credential-eligibility.service';
import {
	credentialEligibility,
	DAY_MS,
	expiryBoundary,
	RETENTION_DAYS,
	type CredentialUpload,
} from './credential-policy';
import {
	credentialTransaction,
	lockCredentialOwner,
} from './credential-transaction';
import {
	ReviewDecision,
	type CredentialActionDto,
	type CredentialQueueDto,
	type ReviewCredentialDto,
	type SubmitCredentialDto,
} from './dto/credential.dto';
import type {
	CredentialRevision,
	CredentialType,
	Prisma,
} from '../prisma/generated/client';

export function credentialSummary(row: CredentialRevision) {
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		expiryDate: row.expiryDate,
		expiresAt: row.expiresAt,
		submittedAt: row.submittedAt,
		digest: row.digest,
		documentAvailable: !row.purgedAt,
		issuerVerification: row.issuerVerification,
		reason: row.reason,
	};
}

@Injectable()
export class ExpertCredentialsService {
	private readonly logger = new Logger(ExpertCredentialsService.name);
	constructor(
		private readonly prisma: PrismaService,
		private readonly storage: CredentialStorageService,
		private readonly eligibility: CredentialEligibilityService,
	) {}
	private async owner(
		db: Prisma.TransactionClient,
		userId: string,
		verified = false,
	) {
		const user = await db.user.findUnique({ where: { id: userId } });
		if (
			!user ||
			user.role !== 'EXPERT' ||
			(verified && !user.email_verified_at)
		)
			throw new ForbiddenException('Verified expert account is required');
		return user;
	}
	private async admin(db: Prisma.TransactionClient, userId: string) {
		const user = await db.user.findUnique({
			where: { id: userId },
			select: { role: true },
		});
		if (user?.role !== 'ADMIN')
			throw new ForbiddenException('Administrator role is required');
	}
	async state(userId: string) {
		await this.owner(this.prisma, userId);
		const expert = await this.eligibility.find(userId);
		const revisions = expert
			? await this.prisma.credentialRevision.findMany({
					where: { expertId: expert.id },
					orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
					take: 100,
				})
			: [];
		return {
			version: expert?.credentialVersion ?? 0,
			...credentialEligibility(expert),
			suspended: !!expert?.credentialSuspendedAt,
			revisions: revisions.map(credentialSummary),
		};
	}
	async submit(
		userId: string,
		type: CredentialType,
		dto: SubmitCredentialDto,
		file: CredentialUpload,
	) {
		const user = await this.owner(this.prisma, userId, true);
		if (dto.holderName !== user.name)
			throw new BadRequestException(
				'holderName must exactly match the registered account name',
			);
		const expiresAt = expiryBoundary(dto.expiryDate);
		if (expiresAt <= new Date())
			throw new BadRequestException(
				'expiryDate must not already be expired',
			);
		const lookup = this.storage.lookup(dto.number);
		this.storage.validate(file);
		const revisionId = randomUUID();
		const numberCipher = this.storage.seal(
			Buffer.from(dto.number),
			revisionId,
		);
		const object = await this.storage.put(file);
		try {
			await credentialTransaction(this.prisma, async (tx) => {
				await lockCredentialOwner(tx, userId);
				const current = await this.owner(tx, userId, true);
				if (current.name !== dto.holderName)
					throw new ConflictException(
						'Account name changed; reload before resubmitting',
					);
				const expert = await tx.expert.upsert({
					where: { userId },
					create: { userId },
					update: {},
				});
				if (expert.credentialVersion !== dto.expectedVersion)
					throw new ConflictException(
						'Credential version is stale; reload',
					);
				if (
					await tx.credentialRevision.findFirst({
						where: { expertId: expert.id, type, status: 'PENDING' },
					})
				)
					throw new ConflictException(
						'This credential already has a pending revision; wait for its review',
					);
				let identity = await tx.credentialIdentity.findUnique({
					where: { type_lookup: { type, lookup } },
				});
				if (identity && identity.expertId !== expert.id)
					throw new ConflictException(
						'Credential identity is already assigned',
					);
				identity ??= await tx.credentialIdentity.create({
					data: { type, lookup, expertId: expert.id },
				});
				await tx.credentialRevision.create({
					data: {
						id: revisionId,
						expertId: expert.id,
						identityId: identity.id,
						type,
						numberCipher,
						holderName: dto.holderName,
						expiryDate: dto.expiryDate,
						expiresAt,
						...object,
					},
				});
				await tx.expert.update({
					where: { id: expert.id },
					data: { credentialVersion: { increment: 1 } },
				});
				await tx.credentialAudit.create({
					data: {
						expertId: expert.id,
						revisionId,
						actorId: userId,
						action: 'SUBMIT',
						reason: 'Owner submitted an immutable document revision.',
					},
				});
			});
		} catch (error) {
			try {
				await this.storage.remove(object.objectKey);
			} catch {
				this.logger.warn(
					'Credential staging cleanup deferred; reconciliation is required',
				);
			}
			throw error;
		}
		return this.state(userId);
	}
	async queue(adminId: string, dto: CredentialQueueDto) {
		await this.admin(this.prisma, adminId);
		const rows = await this.prisma.credentialRevision.findMany({
			where: { status: 'PENDING' },
			orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
			skip: dto.skip,
			take: dto.take,
		});
		return {
			items: rows.map(credentialSummary),
			skip: dto.skip,
			take: dto.take,
		};
	}
	async detail(adminId: string, revisionId: string) {
		await this.admin(this.prisma, adminId);
		const row = await this.prisma.credentialRevision.findUnique({
			where: { id: revisionId },
			include: { expert: { include: { user: true } } },
		});
		if (!row) throw new NotFoundException('Credential revision not found');
		return {
			...credentialSummary(row),
			expertId: row.expertId,
			version: row.expert.credentialVersion,
			number: this.storage
				.open(row.numberCipher, row.id)
				.toString('utf8'),
			holderName: row.holderName,
			accountName: row.expert.user.name,
		};
	}
	async download(userId: string, revisionId: string, asAdmin = false) {
		if (asAdmin) await this.admin(this.prisma, userId);
		else await this.owner(this.prisma, userId);
		const row = await this.prisma.credentialRevision.findFirst({
			where: {
				id: revisionId,
				...(!asAdmin ? { expert: { userId } } : {}),
			},
		});
		if (!row || row.purgedAt)
			throw new NotFoundException('Credential document not found');
		return {
			bytes: await this.storage.read(row.objectKey, row.digest, row.size),
			mime: row.mime,
			filename: `${row.type}-${row.id}.${row.mime === 'application/pdf' ? 'pdf' : row.mime === 'image/png' ? 'png' : 'jpg'}`,
		};
	}
	async review(
		adminId: string,
		revisionId: string,
		dto: ReviewCredentialDto,
	) {
		return credentialTransaction(this.prisma, async (tx) => {
			await this.admin(tx, adminId);
			const snapshot = await tx.credentialRevision.findUnique({
				where: { id: revisionId },
				include: { expert: true },
			});
			if (!snapshot)
				throw new NotFoundException('Credential revision not found');
			await lockCredentialOwner(tx, snapshot.expert.userId);
			const row = await tx.credentialRevision.findUniqueOrThrow({
				where: { id: revisionId },
				include: { expert: { include: { user: true } } },
			});
			if (
				row.expert.credentialVersion !== dto.expectedVersion ||
				row.status !== 'PENDING' ||
				row.digest !== dto.digest
			)
				throw new ConflictException(
					'Stale credential review; reload the document and version',
				);
			const approve = dto.decision === ReviewDecision.APPROVE;
			const now = new Date();
			if (
				approve &&
				(!dto.documentMatches ||
					row.holderName !== row.expert.user.name ||
					row.expiresAt <= now ||
					row.expert.user.role !== 'EXPERT' ||
					!row.expert.user.email_verified_at)
			)
				throw new BadRequestException(
					'Approval requires matching document metadata, current verified identity and unexpired credential',
				);
			const purgeAfter = new Date(
				now.getTime() + RETENTION_DAYS * DAY_MS,
			);
			if (approve) {
				await tx.credentialRevision.updateMany({
					where: {
						expertId: row.expertId,
						type: row.type,
						status: 'APPROVED',
					},
					data: { status: 'SUPERSEDED', purgeAfter },
				});
			}
			await tx.credentialRevision.update({
				where: { id: revisionId },
				data: {
					status: approve ? 'APPROVED' : 'REJECTED',
					reviewedAt: now,
					reviewerId: adminId,
					reason: dto.reason,
					...(!approve ? { purgeAfter } : {}),
				},
			});
			if (approve)
				await tx.credentialReminder.create({ data: { revisionId } });
			const expert = await tx.expert.update({
				where: { id: row.expertId },
				data: { credentialVersion: { increment: 1 } },
			});
			await tx.credentialAudit.create({
				data: {
					expertId: row.expertId,
					revisionId,
					actorId: adminId,
					action: approve ? 'APPROVE' : 'REJECT',
					reason: dto.reason,
				},
			});
			return { version: expert.credentialVersion };
		});
	}
	async setSuspension(
		adminId: string,
		expertId: string,
		dto: CredentialActionDto,
		suspend: boolean,
	) {
		return credentialTransaction(this.prisma, async (tx) => {
			await this.admin(tx, adminId);
			const snapshot = await tx.expert.findUnique({
				where: { id: expertId },
			});
			if (!snapshot) throw new NotFoundException('Expert not found');
			await lockCredentialOwner(tx, snapshot.userId);
			const expert = await tx.expert.findUniqueOrThrow({
				where: { id: expertId },
			});
			if (expert.credentialVersion !== dto.expectedVersion)
				throw new ConflictException(
					'Credential version is stale; reload',
				);
			if (!!expert.credentialSuspendedAt === suspend)
				throw new ConflictException(
					'Expert already has this suspension state',
				);
			await tx.expert.update({
				where: { id: expertId },
				data: {
					credentialSuspendedAt: suspend ? new Date() : null,
					credentialVersion: { increment: 1 },
				},
			});
			await tx.credentialAudit.create({
				data: {
					expertId,
					actorId: adminId,
					action: suspend ? 'SUSPEND' : 'REINSTATE',
					reason: dto.reason,
				},
			});
			return { version: expert.credentialVersion + 1 };
		});
	}
}
