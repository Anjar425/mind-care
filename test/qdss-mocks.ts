import { randomUUID } from 'node:crypto';
import type {
	Prisma,
	QdssConfiguration,
	QdssDataset,
	QdssReference,
	QdssRun,
	QdssAudit,
} from '../src/infrastructure/prisma/generated/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { createGroupsMocks, groupUserId } from './groups-mocks';
import { QdssSnapshotService } from '../src/domain/qdss/qdss-snapshot.service';
import { QdssCalibrationService } from '../src/domain/qdss/qdss-calibration.service';
import { QdssModelService } from '../src/domain/qdss/qdss-model.service';
import { QdssEvaluationService } from '../src/domain/qdss/qdss-evaluation.service';
import { GroupEligibilityService } from '../src/domain/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/domain/expert/expert-profile-completeness.service';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/domain/credentials/credential-eligibility.service';
import { QdssPageQuery } from '../src/api/common/dto/qdss/qdss.requests.dto';
import { COPY_DEFAULTS } from '../src/domain/qdss/qdss.defaults';
type Where = Record<string, unknown>;
function matches(row: object, where: Where = {}): boolean {
	return Object.entries(where).every(([key, value]) => {
		const current = (row as Record<string, unknown>)[key];
		if (
			value !== null &&
			typeof value === 'object' &&
			!(value instanceof Date)
		)
			return matches(row, value as Where);
		return current === value;
	});
}
function table<T extends { id: string }>(
	rows: () => T[],
	defaults: () => object,
	kind: string,
) {
	return {
		findUnique: jest.fn(({ where }: { where: Where }) =>
			Promise.resolve(
				structuredClone(rows().find((r) => matches(r, where)) ?? null),
			),
		),
		findFirst: jest.fn(({ where }: { where: Where; orderBy?: unknown }) =>
			Promise.resolve(
				structuredClone(
					rows()
						.filter((r) => matches(r, where))
						.sort(
							(a, b) =>
								Number(
									(b as Record<string, unknown>).version ?? 0,
								) -
								Number(
									(a as Record<string, unknown>).version ?? 0,
								),
						)[0] ?? null,
				),
			),
		),
		create: jest.fn(({ data }: { data: Partial<T> }) => {
			const row = {
				id: randomUUID(),
				createdAt: new Date(),
				...defaults(),
				...structuredClone(data),
			} as unknown as T;
			if (
				rows().some(
					(r) =>
						r.id === row.id ||
						(kind === 'dataset' &&
							(r as unknown as QdssDataset).configurationId ===
								(row as unknown as QdssDataset)
									.configurationId &&
							(r as unknown as QdssDataset).version ===
								(row as unknown as QdssDataset).version) ||
						(kind === 'run' &&
							(r as unknown as QdssRun).configurationId ===
								(row as unknown as QdssRun).configurationId &&
							(r as unknown as QdssRun).status === 'RUNNING' &&
							(row as unknown as QdssRun).status === 'RUNNING'),
				)
			)
				throw Object.assign(new Error('Synthetic QDSS uniqueness'), {
					code: 'P2002',
				});
			rows().push(row);
			return Promise.resolve(structuredClone(row));
		}),
		update: jest.fn(
			({ where, data }: { where: Where; data: Partial<T> }) => {
				const row = rows().find((r) => matches(r, where));
				if (!row) throw new Error('Missing synthetic QDSS row');
				Object.assign(row, structuredClone(data));
				return Promise.resolve(structuredClone(row));
			},
		),
	};
}
export function createQdssMocks() {
	const groups = createGroupsMocks();
	groups.state.experts[6].user.role = 'ADMIN';
	const state: {
		configurations: QdssConfiguration[];
		datasets: QdssDataset[];
		references: QdssReference[];
		runs: QdssRun[];
		audits: QdssAudit[];
	} = {
		configurations: [],
		datasets: [],
		references: [],
		runs: [],
		audits: [],
	};
	const memberships = (where: {
		groupId?: number;
		expertId?: string;
		status?: string;
		role?: string;
		group?: { archivedAt: null };
	}) =>
		groups.state.memberships.filter(
			(m) =>
				(where.groupId === undefined || m.groupId === where.groupId) &&
				(!where.expertId || m.expertId === where.expertId) &&
				(!where.status || m.status === where.status) &&
				(!where.role || m.role === where.role) &&
				(!where.group ||
					groups.state.groups.some(
						(g) => g.id === m.groupId && !g.archivedAt,
					)),
		);
	const tx = {
		...groups.tx,
		groupMembership: {
			...groups.tx.groupMembership,
			findFirst: jest.fn(
				({ where }: { where: Parameters<typeof memberships>[0] }) =>
					Promise.resolve(
						structuredClone(memberships(where)[0] ?? null),
					),
			),
			findMany: jest.fn(
				({ where }: { where: Parameters<typeof memberships>[0] }) =>
					Promise.resolve(structuredClone(memberships(where))),
			),
			findUnique: jest.fn(
				({
					where,
				}: {
					where: {
						groupId_expertId: { groupId: number; expertId: string };
					};
				}) =>
					Promise.resolve(
						structuredClone(
							groups.state.memberships.find(
								(m) =>
									m.groupId ===
										where.groupId_expertId.groupId &&
									m.expertId ===
										where.groupId_expertId.expertId,
							) ?? null,
						),
					),
			),
		},
		qdssConfiguration: table(
			() => state.configurations,
			() => ({ groupId: null, datasetId: null, activeRunId: null }),
			'configuration',
		),
		qdssDataset: table(
			() => state.datasets,
			() => ({}),
			'dataset',
		),
		qdssReference: table(
			() => state.references,
			() => ({}),
			'reference',
		),
		qdssRun: table(
			() => state.runs,
			() => ({
				status: 'RUNNING',
				referenceId: null,
				weights: null,
				consensus: null,
				outputHash: null,
				failureCode: null,
				completedAt: null,
			}),
			'run',
		),
		qdssAudit: table(
			() => state.audits,
			() => ({ subjectId: null }),
			'audit',
		),
	};
	let queue: Promise<unknown> = Promise.resolve();
	const transaction = jest.fn(
		(work: (db: Prisma.TransactionClient) => Promise<unknown>) => {
			const pending = queue.then(async () => {
				const before = structuredClone(state),
					beforeGroups = structuredClone(groups.state);
				try {
					return await work(
						tx as unknown as Prisma.TransactionClient,
					);
				} catch (error) {
					Object.assign(state, before);
					Object.assign(groups.state, beforeGroups);
					throw error;
				}
			});
			queue = pending.catch(() => undefined);
			return pending;
		},
	);
	const prisma = {
		...tx,
		$transaction: transaction,
	} as unknown as PrismaService;
	return {
		groups,
		state,
		tx,
		transaction,
		prisma,
		provider: { provide: PrismaService, useValue: prisma },
	};
}
export function qdssServices(m = createQdssMocks()) {
	const reference = new ReferenceDataService(m.prisma),
		credentials = new CredentialEligibilityService(m.prisma),
		groups = new GroupEligibilityService(
			m.prisma,
			reference,
			new ExpertProfileCompletenessService(),
		),
		snapshots = new QdssSnapshotService(reference, groups),
		calibration = new QdssCalibrationService(
			m.prisma,
			snapshots,
			credentials,
		),
		models = new QdssModelService(
			m.prisma,
			snapshots,
			calibration,
			credentials,
		),
		evaluation = new QdssEvaluationService(m.prisma, models, snapshots);
	return {
		m,
		reference,
		credentials,
		groups,
		snapshots,
		calibration,
		models,
		evaluation,
	};
}
export const qdssAdmin = groupUserId(7);
export async function qdssFixture() {
	const f = qdssServices();
	const groupId = f.m.groups.seedGroup([1, 2, 3, 4, 5]);
	await f.calibration.initialize(qdssAdmin);
	return { ...f, groupId };
}
export async function datasetSubmission(
	f: ReturnType<typeof qdssServices>,
	userId: string,
	groupId: number | null,
	count = 20,
) {
	const view = await f.calibration.read(userId, groupId, new QdssPageQuery());
	const catalog = await f.snapshots.catalog(
		f.m.tx as unknown as Prisma.TransactionClient,
	);
	return {
		catalogVersion: catalog.catalogVersion,
		expectedStateHash: view.stateHash,
		samples: Array.from({ length: count }, (_, i) => ({
			answers: COPY_DEFAULTS.samples[i % 20].map((score, q) => ({
				dass21Id: catalog.questions[q].id,
				score,
			})),
		})),
	};
}
