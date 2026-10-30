import type { StoredQuestion } from '../src/reference-data/reference-data.types';
import type { StoredConclusion } from '../src/reference-data/reference-seed.types';

export interface SeedState {
	dASS21: StoredQuestion[];
	dASS42: StoredQuestion[];
	conclusion: StoredConclusion[];
}

export function createSeedStore(initial: Partial<SeedState> = {}) {
	let state: SeedState = {
		dASS21: [],
		dASS42: [],
		conclusion: [],
		...structuredClone(initial),
	};
	const failures: {
		create?: keyof SeedState;
		wrongCount?: keyof SeedState;
		hideWrittenRows?: boolean;
		read?: Error;
		commit?: Error & { code?: string };
	} = {};
	function transaction(draft: SeedState) {
		let written = false;
		function questions(collection: 'dASS21' | 'dASS42') {
			return {
				findMany: jest.fn(async (options: { take?: number }) => {
					if (failures.read) throw failures.read;
					await Promise.resolve();
					return failures.hideWrittenRows && written
						? []
						: structuredClone(
								draft[collection].slice(0, options.take),
							);
				}),
				createMany: jest.fn(
					async ({ data }: { data: StoredQuestion[] }) => {
						if (failures.create === collection)
							throw new Error('PRIVATE_PROVIDER_FAILURE');
						draft[collection].push(...structuredClone(data));
						written = true;
						await Promise.resolve();
						return {
							count:
								data.length -
								(failures.wrongCount === collection ? 1 : 0),
						};
					},
				),
			};
		}
		return {
			$executeRaw: jest
				.fn<Promise<number>, [TemplateStringsArray]>()
				.mockResolvedValue(0),
			dASS21: questions('dASS21'),
			dASS42: questions('dASS42'),
			conclusion: {
				findMany: jest.fn(async (options: { take?: number }) => {
					if (failures.read) throw failures.read;
					await Promise.resolve();
					return structuredClone(
						draft.conclusion.slice(0, options.take),
					);
				}),
				createMany: jest.fn(
					async ({
						data,
					}: {
						data: Omit<StoredConclusion, 'id'>[];
					}) => {
						if (failures.create === 'conclusion')
							throw new Error('PRIVATE_PROVIDER_FAILURE');
						let id = Math.max(
							0,
							...draft.conclusion.map((row) => row.id),
						);
						draft.conclusion.push(
							...data.map((row) => ({ ...row, id: ++id })),
						);
						written = true;
						await Promise.resolve();
						return {
							count:
								data.length -
								(failures.wrongCount === 'conclusion' ? 1 : 0),
						};
					},
				),
			},
		};
	}
	type Tx = ReturnType<typeof transaction>;
	const transactions: Tx[] = [];
	const prisma = {
		dASS21: {
			findMany: jest.fn(async () => {
				await Promise.resolve();
				return structuredClone(state.dASS21);
			}),
		},
		dASS42: {
			findMany: jest.fn(async () => {
				await Promise.resolve();
				return structuredClone(state.dASS42);
			}),
		},
		$transaction: jest
			.fn<Promise<unknown>, [(tx: Tx) => Promise<unknown>, unknown]>()
			.mockImplementation(async (operation) => {
				const draft = structuredClone(state);
				const tx = transaction(draft);
				transactions.push(tx);
				const result = await operation(tx);
				if (failures.commit) throw failures.commit;
				state = draft;
				return result;
			}),
	};
	return {
		prisma,
		transactions,
		failures,
		state: () => structuredClone(state),
	};
}
