import { PrismaService } from '../src/prisma/prisma.service';
import type { Prisma } from '../src/prisma/generated/client';
import type {
	StoredPreferenceVector,
	ReplacePreferences,
} from '../src/expert-preferences/expert-preferences.types';
import { DASS21_CATALOG } from '../src/reference-data/catalogs/dass21.catalog';
import { preferencesStateHash } from '../src/expert-preferences/preferences-state.util';
import { credentialExpert, ownerId } from './credential-mocks';
import { storedQuestions } from './reference-data-mocks';

export const preferenceCatalog = () => ({
	instrument: 'DASS21' as const,
	catalogVersion: DASS21_CATALOG.catalogVersion,
	questions: DASS21_CATALOG.questions.map(({ id, number, text }) => ({
		id,
		number,
		text,
	})),
});
export const completePreferenceRows = (
	version = DASS21_CATALOG.catalogVersion,
): StoredPreferenceVector[] =>
	DASS21_CATALOG.questions.map((q) => ({
		dass21Id: q.id,
		catalogVersion: version,
		percentDepression: 40,
		percentAnxiety: 35,
		percentStress: 25,
	}));
export const validPreferencesSubmission = (
	hash = preferencesStateHash(ownerId, DASS21_CATALOG.catalogVersion, []),
): ReplacePreferences => ({
	catalogVersion: DASS21_CATALOG.catalogVersion,
	expectedStateHash: hash,
	preferences: completePreferenceRows().map(
		({ dass21Id, percentDepression, percentAnxiety, percentStress }) => ({
			dass21Id,
			percentDepression,
			percentAnxiety,
			percentStress,
		}),
	),
});

interface MockPreference extends StoredPreferenceVector {
	expertId: string;
	id: number;
}
export function createExpertPreferencesMocks() {
	const expert = credentialExpert();
	const state: { rows: MockPreference[]; nextId: number } = {
		rows: [],
		nextId: 1,
	};
	const upsert = (args: {
		where: { expertId_dass21Id: { expertId: string; dass21Id: string } };
		create: StoredPreferenceVector & { expertId: string };
		update: Omit<StoredPreferenceVector, 'dass21Id'>;
	}) => {
		const key = args.where.expertId_dass21Id;
		let row = state.rows.find(
			(item) =>
				item.expertId === key.expertId &&
				item.dass21Id === key.dass21Id,
		);
		if (row) Object.assign(row, args.update);
		else {
			row = { ...args.create, id: state.nextId++ };
			state.rows.push(row);
		}
		return Promise.resolve({ ...row });
	};
	const tx = {
		user: {
			findUnique: jest
				.fn()
				.mockImplementation(() => Promise.resolve(expert.user)),
		},
		expert: {
			findUnique: jest
				.fn()
				.mockImplementation(() => Promise.resolve(expert)),
		},
		dASS21: {
			findMany: jest
				.fn()
				.mockImplementation(() =>
					Promise.resolve(storedQuestions('DASS21')),
				),
		},
		dASS42: {
			findMany: jest
				.fn()
				.mockImplementation(() =>
					Promise.resolve(storedQuestions('DASS42')),
				),
		},
		preferences: {
			findMany: jest.fn(
				(args: { where: { expertId: string }; take: number }) =>
					Promise.resolve(
						state.rows
							.filter(
								(row) => row.expertId === args.where.expertId,
							)
							.slice(0, args.take)
							.map((row) => ({ ...row })),
					),
			),
			upsert: jest.fn(upsert),
		},
		$queryRaw: jest.fn().mockResolvedValue([]),
	};
	let queue: Promise<unknown> = Promise.resolve();
	const run = async (
		work: (db: Prisma.TransactionClient) => Promise<unknown>,
	): Promise<unknown> => {
		const snapshot = structuredClone(state);
		try {
			return await work(tx as unknown as Prisma.TransactionClient);
		} catch (error) {
			state.rows = snapshot.rows;
			state.nextId = snapshot.nextId;
			throw error;
		}
	};
	const transaction = jest.fn(
		(
			work: (db: Prisma.TransactionClient) => Promise<unknown>,
		): Promise<unknown> => {
			const pending = queue.then(() => run(work));
			queue = pending.catch(() => undefined);
			return pending;
		},
	);
	// Distinct delegate objects prove services honor the supplied transaction client.
	const prisma = {
		...tx,
		user: { ...tx.user },
		expert: { ...tx.expert },
		dASS21: { findMany: jest.fn() },
		dASS42: { findMany: jest.fn() },
		preferences: { findMany: jest.fn(), upsert: jest.fn() },
		$transaction: transaction,
	};
	return {
		expert,
		state,
		tx,
		prisma,
		provider: { provide: PrismaService, useValue: prisma },
	};
}
