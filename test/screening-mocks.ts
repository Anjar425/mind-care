import type { Prisma } from '../src/infrastructure/prisma/generated/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ScreeningsService } from '../src/domain/screening/screenings.service';
import { ScreeningPresentationService } from '../src/domain/screening/screening-presentation.service';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { QdssEvaluationService } from '../src/domain/qdss/qdss-evaluation.service';
import { Dass42InferenceService } from '../src/domain/dass42/dass42-inference.service';
import type {
	Dass42Screening,
	QdssScreening,
} from '../src/shared/contracts/screening';
import { DASS21_CATALOG } from '../src/domain/reference-data/catalogs/dass21.catalog';
import { DASS42_CATALOG } from '../src/domain/reference-data/catalogs/dass42.catalog';
import { historyDocument, historyMocks, historyOwner } from './history-mocks';
import { qdssAdmin, qdssFixture } from './qdss-mocks';
import { inferenceFixture } from './dass42-inference-mocks';
import { groupUserId } from './groups-mocks';

export const publicQdssInput = (group = false): QdssScreening => ({
	catalogVersion: DASS21_CATALOG.catalogVersion,
	scope: group ? 'GROUP' : 'GLOBAL',
	...(group ? { groupId: 1 } : {}),
	answers: DASS21_CATALOG.questions.map((q) => ({
		dass21Id: q.id,
		score: 1,
	})),
});
export const publicDass42Input = (): Dass42Screening => ({
	catalogVersion: DASS42_CATALOG.catalogVersion,
	groupId: 1,
	answers: DASS42_CATALOG.questions.map((q) => ({
		dass42Id: q.id,
		score: 1.5,
	})),
});
export function screeningMocks() {
	const h = historyMocks();
	const tx = {
		...h.prisma,
		group: {
			findUnique: jest.fn(() =>
				Promise.resolve({
					id: 1,
					name: 'Synthetic group',
					privateMemberships: 'must not escape',
				}),
			),
		},
	};
	const transaction = jest.fn(
		async <T>(
			work: (tx: Prisma.TransactionClient) => Promise<T>,
			options?: unknown,
		) => {
			void options;
			return work(tx as unknown as Prisma.TransactionClient);
		},
	);
	const prisma = { ...tx, $transaction: transaction };
	const references = {
		getQuestionnaire: jest.fn((instrument: string, _tx?: unknown) => {
			void _tx;
			const catalog =
				instrument === 'DASS21' ? DASS21_CATALOG : DASS42_CATALOG;
			return Promise.resolve({
				instrument,
				catalogVersion: catalog.catalogVersion,
				questions: catalog.questions.map((q) => ({
					id: q.id,
					number: q.number,
					text: q.text,
				})),
			});
		}),
	};
	const qdoc = historyDocument();
	const qdss = {
		evaluate: jest.fn(() =>
			Promise.resolve({
				modelRunId: 'synthetic-run',
				datasetRevisionId: 'synthetic-dataset',
				algorithmVersion: 'copy-ga-v1',
				catalogVersion: DASS21_CATALOG.catalogVersion,
				result: qdoc.result,
				disclaimer: qdoc.disclaimer,
			}),
		),
	};
	const ddoc = historyDocument(true);
	const dass42 = {
		evaluate: jest.fn(() =>
			Promise.resolve({
				groupId: 1,
				engineVersion: 'web-mamdani-grid-v1',
				configHash: 'a'.repeat(64),
				catalogVersion: DASS42_CATALOG.catalogVersion,
				sourceHash: 'b'.repeat(64),
				evaluatedAt: new Date('2026-11-02T00:00:00.000Z'),
				result: ddoc.result,
				disclaimer: ddoc.disclaimer,
			}),
		),
	};
	const service = new ScreeningsService(
		prisma as unknown as PrismaService,
		references as unknown as ReferenceDataService,
		qdss as unknown as QdssEvaluationService,
		dass42 as unknown as Dass42InferenceService,
		new ScreeningPresentationService(),
	);
	const principal = {
		sub: historyOwner,
		sid: 'screening-test-session',
		jti: 'synthetic-jti',
		email: 'synthetic@example.invalid',
		role: 'USER',
		type: 'access' as const,
	};
	h.sessions.set(principal.sid, {
		userId: historyOwner,
		expiresAt: new Date(Date.now() + 60000),
	});
	return {
		h,
		tx,
		prisma,
		transaction,
		references,
		qdss,
		dass42,
		service,
		principal,
	};
}
// Real group/rule/model/reference/numeric services. Only persistence is synthetic.
export async function realScreeningFixture() {
	const q = await qdssFixture();
	const d = await inferenceFixture();
	await q.models.recalibrate(
		qdssAdmin,
		null,
		(await q.models.read(qdssAdmin, null)).nextInputHash!,
	);
	await q.models.recalibrate(
		groupUserId(1),
		q.groupId,
		(await q.models.read(groupUserId(1), q.groupId)).nextInputHash!,
	);
	const sessions = new Map<string, { userId: string; expiresAt: Date }>();
	const tx = {
		...d.m.tx,
		...q.m.tx,
		group: {
			...q.m.tx.group,
			// Honor the public lookup's archive predicate, which the older general fixture ignores.
			findUnique: jest.fn(
				async (
					query: Parameters<typeof q.m.tx.group.findUnique>[0] & {
						where: { archivedAt?: null };
					},
				) => {
					const group = await q.m.tx.group.findUnique(query);
					return query.where.archivedAt === null && group?.archivedAt
						? null
						: group;
				},
			),
		},
		refreshToken: {
			findFirst: jest.fn(
				async ({
					where,
				}: {
					where: {
						id: string;
						userId: string;
						expiresAt: { gt: Date };
					};
				}) => {
					const s = sessions.get(where.id);
					const user = await q.m.tx.user.findUnique({
						where: { id: where.userId },
					});
					return s &&
						s.userId === where.userId &&
						s.expiresAt > where.expiresAt.gt &&
						user
						? { id: where.id, ...s, user }
						: null;
				},
			),
		},
	};
	const transaction = jest.fn(
		async <T>(
			work: (tx: Prisma.TransactionClient) => Promise<T>,
			options?: unknown,
		) => {
			void options;
			return work(tx as unknown as Prisma.TransactionClient);
		},
	);
	const prisma = { ...tx, $transaction: transaction };
	const service = new ScreeningsService(
		prisma as unknown as PrismaService,
		q.reference,
		q.evaluation,
		d.inference,
		new ScreeningPresentationService(),
	);
	return { q, d, tx, prisma, service, transaction, sessions };
}
