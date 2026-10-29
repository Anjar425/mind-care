import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceDataService } from './reference-data.service';
import {
	createReferencePrismaMock,
	storedQuestions,
} from '../../test/reference-data-mocks';
import type { StoredQuestion } from './reference-data.types';

describe('ReferenceDataService', () => {
	let module: TestingModule;
	let service: ReferenceDataService;
	let prisma: ReturnType<typeof createReferencePrismaMock>;
	beforeEach(async () => {
		prisma = createReferencePrismaMock();
		module = await Test.createTestingModule({
			providers: [
				ReferenceDataService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();
		service = module.get(ReferenceDataService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it.each(['DASS21', 'DASS42'] as const)(
		'should return only ordered public fields when %s storage is complete',
		async (instrument) => {
			const delegate =
				instrument === 'DASS21' ? prisma.dASS21 : prisma.dASS42;
			delegate.findMany.mockResolvedValue(
				storedQuestions(instrument).reverse(),
			);
			const result = await service.getQuestionnaire(instrument);
			expect(result.instrument).toBe(instrument);
			expect(result.catalogVersion).toBe('prototype-candidate-v1');
			expect(result.questions.map((question) => question.number)).toEqual(
				Array.from(
					{ length: instrument === 'DASS21' ? 21 : 42 },
					(_, index) => index + 1,
				),
			);
			expect(Object.keys(result.questions[0]).sort()).toEqual([
				'id',
				'number',
				'text',
			]);
			expect(delegate.findMany).toHaveBeenCalledWith({
				select: {
					id: true,
					number: true,
					text: true,
					category: true,
					catalogVersion: true,
				},
			});
			const other =
				instrument === 'DASS21' ? prisma.dASS42 : prisma.dASS21;
			expect(other.findMany).not.toHaveBeenCalled();
		},
	);
	it.each(['DASS21', 'DASS42'] as const)(
		'should reject missing data when the %s catalog is not ingested',
		async (instrument) => {
			const delegate =
				instrument === 'DASS21' ? prisma.dASS21 : prisma.dASS42;
			delegate.findMany.mockResolvedValue([]);
			await expect(
				service.getQuestionnaire(instrument),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
	it.each([
		{ id: 'UNKNOWN' },
		{ number: 2 },
		{ text: 'changed' },
		{ category: 'ANXIETY' },
		{ catalogVersion: 'unknown-version' },
	] as const)(
		'should reject the catalog when a stored row differs by %p',
		async (patch) => {
			const rows = storedQuestions('DASS21');
			rows[0] = { ...rows[0], ...patch };
			prisma.dASS21.findMany.mockResolvedValue(rows);
			await expect(service.getQuestionnaire('DASS21')).rejects.toThrow(
				'Reference catalog unavailable',
			);
		},
	);
	it.each(['partial', 'extra', 'duplicate'] as const)(
		'should reject incomplete identity sets when storage is %s',
		async (kind) => {
			let rows = storedQuestions('DASS42');
			if (kind === 'partial') rows = rows.slice(1);
			if (kind === 'extra') rows.push({ ...rows[0], id: 'UNKNOWN' });
			if (kind === 'duplicate') rows[1] = { ...rows[0] };
			prisma.dASS42.findMany.mockResolvedValue(rows);
			await expect(
				service.getQuestionnaire('DASS42'),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
	it('should hide provider details when the database or migration is unavailable', async () => {
		prisma.dASS21.findMany.mockRejectedValue(
			new Error('PRIVATE_CONNECTION_OR_QUERY'),
		);
		await expect(service.getQuestionnaire('DASS21')).rejects.toEqual(
			new ServiceUnavailableException('Reference catalog unavailable'),
		);
	});
	it('should project fields when a mock row contains unrelated private data', async () => {
		const rows: (StoredQuestion & { privateData: string })[] =
			storedQuestions('DASS21').map((row) => ({
				...row,
				privateData: 'PRIVATE',
			}));
		prisma.dASS21.findMany.mockResolvedValue(rows);
		expect(
			JSON.stringify(await service.getQuestionnaire('DASS21')),
		).not.toContain('PRIVATE');
	});
	it('should provide immutable internal taxonomies when later features request them', () => {
		expect(service.getCategories()).toEqual([
			'DEPRESSION',
			'ANXIETY',
			'STRESS',
		]);
		expect(service.getDASS42SeverityLevels()).toEqual([
			'NORMAL',
			'MILD',
			'MODERATE',
			'SEVERE',
			'EXTREMELY_SEVERE',
		]);
		expect(service.getConclusionPairs()).toHaveLength(15);
		expect(Object.isFrozen(service.getConclusionPairs())).toBe(true);
		expect(
			service
				.getConclusionPairs()
				.every((pair) => Object.isFrozen(pair) && !('id' in pair)),
		).toBe(true);
	});
});
