import { HistoryService } from '../src/history/history.service';
import { HistoryVaultService } from '../src/history/history-vault.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { Prisma } from '../src/prisma/generated/client';
import type {
	HistoryEntry,
	HistoryVault,
	VaultInitialization,
} from '../src/history/history.types';
import type { HistoryDocument } from '../src/history/client/history-document';

export const historyOwner = '10000000-0000-4000-8000-000000000001';
export const historyOther = '10000000-0000-4000-8000-000000000002';
export const historyVaultId = '20000000-0000-4000-8000-000000000001';
export const historyEntryId = '30000000-0000-4000-8000-000000000001';
export const historyInit = (): VaultInitialization => ({
	vaultId: historyVaultId,
	envelopeVersion: 1,
	recoveryVersion: 1,
	recoveryNonce: Buffer.alloc(12, 1).toString('base64url'),
	recoveryCiphertext: Buffer.alloc(48, 2).toString('base64url'),
});
export const historyEntryInput = (revision = 1) => ({
	expectedVaultRevision: revision,
	vaultId: historyVaultId,
	keyEpoch: 1,
	envelopeVersion: 1,
	nonce: Buffer.alloc(12, 3).toString('base64url'),
	ciphertext: Buffer.alloc(32, 4).toString('base64url'),
});
export const historyDocument = (dass42 = false): HistoryDocument => ({
	schemaVersion: 1,
	instrument: dass42 ? 'DASS42_MAMDANI' : 'QDSS_DASS21',
	assessedAt: '2026-11-02T00:00:00.000Z',
	context: dass42
		? {
				scope: 'GROUP',
				group: { id: 1, name: 'Synthetic group' },
				catalogVersion: 'dass42-v1',
				algorithmVersion: 'web-mamdani-grid-v1',
				configHash: 'a'.repeat(64),
				sourceHash: 'b'.repeat(64),
				evaluatedAt: '2026-11-02T00:00:00.000Z',
			}
		: {
				scope: 'GLOBAL',
				group: null,
				catalogVersion: 'dass21-v1',
				algorithmVersion: 'copy-ga-v1',
				modelRunId: 'synthetic-run',
				datasetRevisionId: 'synthetic-dataset',
			},
	disclaimer: 'Screening support only, not a diagnosis.',
	answers: Array.from({ length: dass42 ? 42 : 21 }, (_, i) => ({
		questionId: `DASS${dass42 ? 42 : 21}-Q${String(i + 1).padStart(2, '0')}`,
		score: dass42 ? 1.5 : 1,
	})),
	result: dass42
		? Object.fromEntries(
				['depression', 'anxiety', 'stress'].map((category) => [
					category,
					{
						category,
						score: 6,
						membership_degrees: {
							Normal: 0.5,
							Mild: 0,
							Moderate: 0,
							Severe: 0,
							'Extremely Severe': 0,
						},
					},
				]),
			)
		: {
				depression: 0.5,
				anxiety: 0.3,
				stress: 0.2,
				copyHistoryLabel: 'Moderate',
			},
});
interface EntryWhere {
	id?: string;
	vaultId?: string;
	vault?: { userId: string };
}
export function historyMocks() {
	const users = new Map<string, string>([
		[historyOwner, 'USER'],
		[historyOther, 'EXPERT'],
	]);
	const vaults = new Map<string, HistoryVault>();
	const entries = new Map<string, HistoryEntry>();
	const sessions = new Map<string, { userId: string; expiresAt: Date }>();
	const copy = <T>(value: T): T => structuredClone(value);
	const conflict = () =>
		Object.assign(new Error('synthetic constraint'), { code: 'P2002' });
	const matches = (entry: HistoryEntry, where: EntryWhere) =>
		(!where.id || entry.id === where.id) &&
		(!where.vaultId || entry.vaultId === where.vaultId) &&
		(!where.vault ||
			[...vaults.values()].some(
				(v) =>
					v.id === entry.vaultId && v.userId === where.vault?.userId,
			));
	const prisma = {
		user: {
			findUnique: jest.fn(({ where }: { where: { id: string } }) =>
				Promise.resolve(
					users.has(where.id)
						? {
								id: where.id,
								role: users.get(where.id)!,
								name: 'Synthetic owner',
								email: 'synthetic@example.invalid',
							}
						: null,
				),
			),
		},
		refreshToken: {
			findFirst: jest.fn(
				({
					where,
				}: {
					where: {
						id: string;
						userId: string;
						expiresAt: { gt: Date };
					};
				}) => {
					const session = sessions.get(where.id);
					return Promise.resolve(
						session &&
							session.userId === where.userId &&
							session.expiresAt > where.expiresAt.gt &&
							users.has(where.userId)
							? {
									id: where.id,
									...session,
									user: {
										id: where.userId,
										name: 'Synthetic owner',
										email: 'synthetic@example.invalid',
										role: users.get(where.userId)!,
									},
								}
							: null,
					);
				},
			),
		},
		historyVault: {
			findUnique: jest.fn(({ where }: { where: { userId: string } }) =>
				Promise.resolve(copy(vaults.get(where.userId) ?? null)),
			),
			create: jest.fn(
				({
					data,
				}: {
					data: {
						id: string;
						userId: string;
						envelopeVersion: number;
						keyEpoch: number;
						recoveryVersion: number;
						recoveryNonce: string;
						recoveryCiphertext: string;
					};
				}) => {
					if (
						vaults.has(data.userId) ||
						[...vaults.values()].some((v) => v.id === data.id)
					)
						throw conflict();
					const vault: HistoryVault = {
						...data,
						revision: 0,
						storageConsent: false,
						consentUpdatedAt: null,
						createdAt: new Date(),
					};
					vaults.set(data.userId, vault);
					return Promise.resolve(copy(vault));
				},
			),
			updateMany: jest.fn(
				({
					where,
				}: {
					where: {
						userId: string;
						revision: { equals: number; lt: number };
					};
					data: unknown;
				}) => {
					const v = vaults.get(where.userId);
					if (
						!v ||
						v.revision !== where.revision.equals ||
						v.revision >= where.revision.lt
					)
						return Promise.resolve({ count: 0 });
					v.revision++;
					return Promise.resolve({ count: 1 });
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { userId: string };
					data: Partial<HistoryVault>;
				}) => {
					const v = vaults.get(where.userId);
					if (!v) throw new Error('missing synthetic vault');
					Object.assign(v, data);
					return Promise.resolve(copy(v));
				},
			),
		},
		historyEntry: {
			findFirst: jest.fn(({ where }: { where: EntryWhere }) =>
				Promise.resolve(
					copy(
						[...entries.values()].find((v) => matches(v, where)) ??
							null,
					),
				),
			),
			findMany: jest.fn(
				({
					where,
					cursor,
					skip,
					take,
				}: {
					where: EntryWhere;
					cursor?: { id: string };
					skip?: number;
					take: number;
					orderBy: unknown;
				}) => {
					const rows = [...entries.values()]
						.filter((v) => matches(v, where))
						.sort((a, b) => a.id.localeCompare(b.id));
					const offset = cursor
						? rows.findIndex((v) => v.id === cursor.id) +
							(skip ?? 0)
						: 0;
					return Promise.resolve(
						copy(rows.slice(offset, offset + take)),
					);
				},
			),
			count: jest.fn(({ where }: { where: EntryWhere }) =>
				Promise.resolve(
					[...entries.values()].filter((v) => matches(v, where))
						.length,
				),
			),
			create: jest.fn(
				({ data }: { data: Omit<HistoryEntry, 'createdAt'> }) => {
					if (
						entries.has(data.id) ||
						[...entries.values()].some(
							(e) =>
								e.vaultId === data.vaultId &&
								e.keyEpoch === data.keyEpoch &&
								e.nonce === data.nonce,
						)
					)
						throw conflict();
					const entry = { ...data, createdAt: new Date() };
					entries.set(data.id, entry);
					return Promise.resolve(copy(entry));
				},
			),
			deleteMany: jest.fn(({ where }: { where: EntryWhere }) => {
				let count = 0;
				for (const [id, e] of entries)
					if (matches(e, where)) {
						entries.delete(id);
						count++;
					}
				return Promise.resolve({ count });
			}),
		},
		$transaction: jest.fn(
			async <T>(
				work: (tx: Prisma.TransactionClient) => Promise<T>,
				options?: unknown,
			): Promise<T> => {
				void options;
				const execute = async () => {
					const snapshot = {
						vaults: copy(vaults),
						entries: copy(entries),
					};
					try {
						return await work(
							prisma as unknown as Prisma.TransactionClient,
						);
					} catch (e) {
						vaults.clear();
						entries.clear();
						for (const [id, v] of snapshot.vaults)
							vaults.set(id, v);
						for (const [id, v] of snapshot.entries)
							entries.set(id, v);
						throw e;
					}
				};
				const next = tail.then(execute);
				tail = next.then(
					() => undefined,
					() => undefined,
				);
				return next;
			},
		),
	};
	let tail = Promise.resolve();
	const vaultService = new HistoryVaultService(
		prisma as unknown as PrismaService,
	);
	const service = new HistoryService(
		prisma as unknown as PrismaService,
		vaultService,
	);
	const ready = async () => {
		await vaultService.initialize(historyOwner, historyInit());
		await vaultService.consent(historyOwner, {
			expectedVaultRevision: 0,
			enabled: true,
		});
	};
	return {
		prisma,
		vaults,
		entries,
		users,
		sessions,
		vaultService,
		service,
		ready,
	};
}
