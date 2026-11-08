import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { HistoryVaultService } from './history-vault.service';
import {
	entryMutation,
	historyBadInput,
	historyId,
	vaultMutation,
} from './history-envelope.validation';
import { historyTransaction } from './history-persistence';
import {
	MAX_HISTORY_ENTRIES,
	type HistoryPageQuery,
} from '../../shared/contracts/history-envelope';

@Injectable()
export class HistoryService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly vaults: HistoryVaultService,
	) {}
	list(userId: string, query: HistoryPageQuery) {
		if (
			!Number.isInteger(query.limit) ||
			query.limit < 1 ||
			query.limit > 100
		)
			historyBadInput();
		if (query.cursor !== undefined) historyId(query.cursor);
		if (
			query.expectedVaultRevision !== undefined &&
			(!Number.isInteger(query.expectedVaultRevision) ||
				query.expectedVaultRevision < 0 ||
				query.expectedVaultRevision >= 2147483647)
		)
			historyBadInput();
		const { cursor, limit, expectedVaultRevision } = query;
		return historyTransaction(
			this.prisma,
			userId,
			async (tx) => {
				const vault = await this.vaults.require(tx, userId);
				if (
					expectedVaultRevision !== undefined &&
					expectedVaultRevision !== vault.revision
				)
					throw new ConflictException(
						'History changed; restart pagination',
					);
				if (
					cursor &&
					!(await tx.historyEntry.findFirst({
						where: { id: cursor, vaultId: vault.id },
					}))
				)
					throw new NotFoundException(
						'Private history entry not found',
					);
				const entries = await tx.historyEntry.findMany({
					where: { vaultId: vault.id },
					orderBy: { id: 'asc' },
					take: limit + 1,
					...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
				});
				const hasMore = entries.length > limit;
				const items = entries.slice(0, limit);
				return {
					entries: items,
					vaultRevision: vault.revision,
					nextCursor: hasMore ? items[items.length - 1].id : null,
				};
			},
			true,
		);
	}
	read(userId: string, id: string) {
		historyId(id);
		return historyTransaction(
			this.prisma,
			userId,
			async (tx) => {
				const entry = await tx.historyEntry.findFirst({
					where: { id, vault: { userId } },
				});
				if (!entry)
					throw new NotFoundException(
						'Private history entry not found',
					);
				return entry;
			},
			true,
		);
	}
	save(userId: string, id: string, input: unknown) {
		historyId(id);
		const dto = entryMutation(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			const vault = await this.vaults.require(tx, userId);
			if (!vault.storageConsent)
				throw new ConflictException(
					'Enable history storage consent before saving',
				);
			if (vault.id !== dto.vaultId || vault.keyEpoch !== dto.keyEpoch)
				throw new ConflictException(
					'History vault changed; reload before saving',
				);
			const existing = await tx.historyEntry.findFirst({
				where: { id, vaultId: vault.id },
			});
			if (existing) {
				if (
					existing.nonce !== dto.nonce ||
					existing.ciphertext !== dto.ciphertext ||
					existing.envelopeVersion !== dto.envelopeVersion ||
					existing.keyEpoch !== dto.keyEpoch
				)
					throw new ConflictException('History entry is immutable');
				return {
					entry: existing,
					vaultRevision: vault.revision,
					created: false,
				};
			}
			if (
				(await tx.historyEntry.count({
					where: { vaultId: vault.id },
				})) >= MAX_HISTORY_ENTRIES
			)
				throw new ConflictException(
					'Private history storage capacity reached; no records were removed',
				);
			await this.vaults.advance(tx, userId, dto.expectedVaultRevision);
			const entry = await tx.historyEntry.create({
				data: {
					id,
					vaultId: vault.id,
					keyEpoch: dto.keyEpoch,
					envelopeVersion: dto.envelopeVersion,
					nonce: dto.nonce,
					ciphertext: dto.ciphertext,
				},
			});
			return { entry, vaultRevision: vault.revision + 1, created: true };
		});
	}
	remove(userId: string, id: string, input: unknown) {
		historyId(id);
		const dto = vaultMutation(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			const vault = await this.vaults.require(tx, userId);
			if (
				!(await tx.historyEntry.findFirst({
					where: { id, vaultId: vault.id },
				}))
			)
				throw new NotFoundException('Private history entry not found');
			await this.vaults.advance(tx, userId, dto.expectedVaultRevision);
			await tx.historyEntry.deleteMany({
				where: { id, vaultId: vault.id },
			});
			return { vaultRevision: vault.revision + 1 };
		});
	}
	removeAll(userId: string, input: unknown) {
		const dto = vaultMutation(input);
		return historyTransaction(this.prisma, userId, async (tx) => {
			const vault = await this.vaults.require(tx, userId);
			await this.vaults.advance(tx, userId, dto.expectedVaultRevision);
			await tx.historyEntry.deleteMany({ where: { vaultId: vault.id } });
			return { vaultRevision: vault.revision + 1 };
		});
	}
}
