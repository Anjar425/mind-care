import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceSeedService } from './reference-seed.service';
import { ReferenceSeedError } from './reference-seed.types';
import { getReferenceSeedBundle } from './reference-seed.plan';
import { createSeedStore } from '../../test/reference-seed-mocks';
import * as validation from './catalog-validator';
import { ReferenceDataService } from './reference-data.service';

describe('ReferenceSeedService', () => {
	let module: TestingModule;
	let service: ReferenceSeedService;
	let store: ReturnType<typeof createSeedStore>;
	async function create(initial: Parameters<typeof createSeedStore>[0] = {}) {
		store = createSeedStore(initial);
		module = await Test.createTestingModule({
			providers: [
				ReferenceSeedService,
				ReferenceDataService,
				{ provide: PrismaService, useValue: store.prisma },
			],
		}).compile();
		service = module.get(ReferenceSeedService);
	}
	beforeEach(async () => create());
	afterEach(async () => {
		await module.close();
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	it('should preview all candidate rows when storage is empty without writing', async () => {
		const report = await service.run();
		expect(report).toEqual(
			expect.objectContaining({
				mode: 'preview',
				canApply: true,
				inserted: 0,
				collections: {
					DASS21: { expected: 21, insert: 21, unchanged: 0 },
					DASS42: { expected: 42, insert: 42, unchanged: 0 },
					Conclusion: { expected: 15, insert: 15, unchanged: 0 },
				},
			}),
		);
		expect(store.state()).toEqual({
			dASS21: [],
			dASS42: [],
			conclusion: [],
		});
		expect(store.transactions[0].dASS21.createMany).not.toHaveBeenCalled();
		expect(store.transactions[0].$executeRaw).not.toHaveBeenCalled();
		expect(store.prisma.$transaction.mock.calls[0][1]).toEqual({
			isolationLevel: 'Serializable',
		});
	});
	it('should atomically seed all three collections when apply is requested', async () => {
		const report = await service.run(true);
		expect(report.mode).toBe('apply');
		expect(report.inserted).toBe(78);
		expect(store.state().dASS21).toHaveLength(21);
		expect(store.state().dASS42).toHaveLength(42);
		expect(store.state().conclusion).toHaveLength(15);
		expect(store.transactions[0].$executeRaw).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.stringContaining('LOCK TABLE'),
			]) as unknown,
		);
		expect(
			store.transactions[0].conclusion.createMany.mock.calls[0][0].data.every(
				(row) => !('id' in row),
			),
		).toBe(true);
	});
	it('should leave identical data untouched when apply is repeated', async () => {
		await service.run(true);
		const before = store.state();
		const report = await service.run(true);
		expect(report.inserted).toBe(0);
		expect(report.collections.DASS21.unchanged).toBe(21);
		expect(store.state()).toEqual(before);
		expect(store.transactions[1].dASS21.createMany).not.toHaveBeenCalled();
		expect(store.transactions[1].dASS42.createMany).not.toHaveBeenCalled();
		expect(
			store.transactions[1].conclusion.createMany,
		).not.toHaveBeenCalled();
	});
	it('should preserve existing conclusion IDs when only missing reference rows are inserted', async () => {
		await module.close();
		const bundle = getReferenceSeedBundle();
		await create({
			dASS21: bundle.dass21.slice(0, 10),
			dASS42: bundle.dass42.slice(0, 20),
			conclusion: [{ ...bundle.conclusions[0], id: 901 }],
		});
		const report = await service.run(true);
		expect(report.inserted).toBe(47);
		expect(
			store
				.state()
				.conclusion.find(
					(row) =>
						row.category === bundle.conclusions[0].category &&
						row.severty === bundle.conclusions[0].severty,
				)?.id,
		).toBe(901);
	});
	it.each(['text', 'number', 'category', 'catalogVersion'] as const)(
		'should reject conflicting %s without any writes',
		async (field) => {
			await module.close();
			const bundle = getReferenceSeedBundle();
			const first = {
				...bundle.dass21[0],
				[field]: field === 'number' ? 99 : 'PRIVATE_CONFLICT_VALUE',
			};
			await create({ dASS21: [first] });
			const preview = await service.run();
			expect(preview.canApply).toBe(false);
			expect(preview.conflicts).toContainEqual({
				collection: 'DASS21',
				reason: 'CONTENT_MISMATCH',
				questionId: 'DASS21-Q01',
			});
			expect(JSON.stringify(preview)).not.toContain(
				'PRIVATE_CONFLICT_VALUE',
			);
			const before = store.state();
			await expect(service.run(true)).rejects.toMatchObject({
				code: 'CONFLICT',
			});
			expect(store.state()).toEqual(before);
			expect(
				store.transactions[1].dASS21.createMany,
			).not.toHaveBeenCalled();
		},
	);
	it('should reject unexpected question identities without printing their submitted values', async () => {
		await module.close();
		const bundle = getReferenceSeedBundle();
		await create({
			dASS42: [{ ...bundle.dass42[0], id: 'PRIVATE_UNEXPECTED_ID' }],
		});
		const report = await service.run();
		expect(report.canApply).toBe(false);
		expect(JSON.stringify(report)).not.toContain('PRIVATE_UNEXPECTED_ID');
	});
	it('should reject duplicate conclusions when the storage invariant is broken', async () => {
		await module.close();
		const pair = getReferenceSeedBundle().conclusions[0];
		await create({
			conclusion: [
				{ ...pair, id: 1 },
				{ ...pair, id: 2 },
			],
		});
		await expect(service.run(true)).rejects.toMatchObject({
			code: 'CONFLICT',
		});
		expect(
			store.transactions[0].conclusion.createMany,
		).not.toHaveBeenCalled();
	});
	it('should reject duplicate question IDs when storage returns an invalid set', async () => {
		await module.close();
		const row = getReferenceSeedBundle().dass21[0];
		await create({ dASS21: [row, row] });
		expect((await service.run()).conflicts).toContainEqual({
			collection: 'DASS21',
			reason: 'DUPLICATE_IDENTITY',
		});
	});
	it.each(['dASS21', 'dASS42', 'conclusion'] as const)(
		'should roll back every collection when %s insertion fails',
		async (collection) => {
			store.failures.create = collection;
			await expect(service.run(true)).rejects.toMatchObject({
				code: 'STORAGE_UNAVAILABLE',
			});
			expect(store.state()).toEqual({
				dASS21: [],
				dASS42: [],
				conclusion: [],
			});
		},
	);
	it('should roll back when the database reports an incomplete write count', async () => {
		store.failures.wrongCount = 'conclusion';
		await expect(service.run(true)).rejects.toMatchObject({
			code: 'WRITE_INCOMPLETE',
		});
		expect(store.state().dASS21).toHaveLength(0);
	});
	it('should roll back when the post-write catalog does not match', async () => {
		store.failures.hideWrittenRows = true;
		await expect(service.run(true)).rejects.toMatchObject({
			code: 'WRITE_INCOMPLETE',
		});
		expect(store.state().dASS21).toHaveLength(0);
	});
	it.each(['P2034', 'P2002'])(
		'should request a fresh preview when a concurrent database failure has code %s',
		async (code) => {
			store.failures.commit = Object.assign(
				new Error('PRIVATE_DATABASE_DETAIL'),
				{ code },
			);
			await expect(service.run(true)).rejects.toMatchObject({
				code: 'CONCURRENT_CHANGE',
			});
			expect(store.state().conclusion).toHaveLength(0);
		},
	);
	it('should hide provider details when reference migration or connectivity is unavailable', async () => {
		store.failures.read = new Error('PRIVATE_DATABASE_DETAIL');
		await expect(service.run()).rejects.toEqual(
			new ReferenceSeedError(
				'STORAGE_UNAVAILABLE',
				'Reference storage is unavailable; check database access and apply the reference metadata migration first',
			),
		);
	});
	it('should reject invalid release content before contacting storage', async () => {
		jest.spyOn(validation, 'validateCatalog').mockImplementation(() => {
			throw new validation.CatalogValidationError([
				'invalid source item',
			]);
		});
		await expect(service.run(true)).rejects.toMatchObject({
			code: 'INVALID_CATALOG',
		});
		expect(store.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should satisfy the read API catalog contract after a successful seed', async () => {
		const reader = module.get(ReferenceDataService);
		await expect(reader.getQuestionnaire('DASS21')).rejects.toThrow(
			'Reference catalog unavailable',
		);
		await service.run(true);
		expect(
			(await reader.getQuestionnaire('DASS21')).questions,
		).toHaveLength(21);
		expect(
			(await reader.getQuestionnaire('DASS42')).questions,
		).toHaveLength(42);
	});
});
