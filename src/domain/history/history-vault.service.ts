import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import {
	consentMutation,
	initialization,
	recoveryReplacement,
} from './history-envelope.validation';
import { historyTransaction } from './history-persistence';

@Injectable()
export class HistoryVaultService {
	constructor(private readonly prisma: PrismaService) {}
	async require(tx: Prisma.TransactionClient, userId: string) {
		const vault = await tx.historyVault.findUnique({ where: { userId } });
		if (!vault)
			throw new NotFoundException('Private history vault not found');
		return vault;
	}
	async advance(
		tx: Prisma.TransactionClient,
		userId: string,
		expected: number,
	) {
		const result = await tx.historyVault.updateMany({
			where: { userId, revision: { equals: expected, lt: 2147483646 } },
			data: { revision: { increment: 1 } },
		});
		if (result.count !== 1)
			throw new ConflictException('History changed; reload and retry');
	}
	read(userId: string) {
		return historyTransaction(
			this.prisma,
			userId,
			(tx) => this.require(tx, userId),
			true,
		);
	}
	initialize(userId: string, input: unknown) {
		const dto = initialization(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			const existing = await tx.historyVault.findUnique({
				where: { userId },
			});
			if (existing)
				throw new ConflictException(
					'Private history vault already exists',
				);
			return tx.historyVault.create({
				data: {
					id: dto.vaultId,
					userId,
					envelopeVersion: 1,
					keyEpoch: 1,
					recoveryVersion: dto.recoveryVersion,
					recoveryNonce: dto.recoveryNonce,
					recoveryCiphertext: dto.recoveryCiphertext,
				},
			});
		});
	}
	consent(userId: string, input: unknown) {
		const dto = consentMutation(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			await this.require(tx, userId);
			await this.advance(tx, userId, dto.expectedVaultRevision);
			return tx.historyVault.update({
				where: { userId },
				data: {
					storageConsent: dto.enabled,
					consentUpdatedAt: new Date(),
				},
			});
		});
	}
	replaceRecovery(userId: string, input: unknown) {
		const dto = recoveryReplacement(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			const vault = await this.require(tx, userId);
			if (dto.recoveryVersion !== vault.recoveryVersion + 1)
				throw new ConflictException(
					'Recovery version changed; reload and retry',
				);
			await this.advance(tx, userId, dto.expectedVaultRevision);
			return tx.historyVault.update({
				where: { userId },
				data: {
					recoveryVersion: dto.recoveryVersion,
					recoveryNonce: dto.recoveryNonce,
					recoveryCiphertext: dto.recoveryCiphertext,
				},
			});
		});
	}
}
