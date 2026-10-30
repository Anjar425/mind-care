import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { ExpertService } from './expert.service';

interface ListedExpert {
	id: string;
	user: { name: string };
	photo: string | null;
	gender: string;
	verifiedUntil: Date | null;
}

describe('ExpertService', () => {
	let service: ExpertService;
	let module: TestingModule;
	let prisma: {
		expert: {
			findMany: jest.Mock<Promise<ListedExpert[]>, [unknown]>;
			count: jest.Mock<Promise<number>, []>;
		};
		$transaction: jest.Mock<Promise<unknown[]>, [Promise<unknown>[]]>;
	};
	beforeEach(async () => {
		prisma = {
			expert: {
				findMany: jest
					.fn<Promise<ListedExpert[]>, [unknown]>()
					.mockResolvedValue([]),
				count: jest.fn<Promise<number>, []>().mockResolvedValue(0),
			},
			$transaction: jest.fn((queries: Promise<unknown>[]) =>
				Promise.all(queries),
			),
		};
		module = await Test.createTestingModule({
			providers: [
				ExpertService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();
		service = module.get(ExpertService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should select the related name and preserve a flat response when experts exist', async () => {
		prisma.expert.findMany.mockResolvedValue([
			{
				id: 'expert',
				user: { name: 'Example Expert' },
				photo: null,
				gender: 'NOT_SPECIFIED',
				verifiedUntil: null,
			},
		]);
		prisma.expert.count.mockResolvedValue(12);
		const result = await service.findAll({ page: 2, limit: 5 });
		expect(prisma.expert.findMany).toHaveBeenCalledWith({
			skip: 5,
			take: 5,
			select: {
				id: true,
				user: { select: { name: true } },
				photo: true,
				gender: true,
				verifiedUntil: true,
			},
			orderBy: { userId: 'desc' },
		});
		expect(result.data[0]).toEqual({
			id: 'expert',
			name: 'Example Expert',
			photo: null,
			gender: 'NOT_SPECIFIED',
			verifiedUntil: null,
			verificationStatus: 'Not Verified',
		});
		expect(result.data[0]).not.toHaveProperty('user');
		expect(result.meta).toEqual({
			total: 12,
			page: 2,
			limit: 5,
			totalPages: 3,
			hasNextPage: true,
			hasPreviousPage: true,
		});
	});
	it('should retain defaults and empty metadata when no experts exist', async () => {
		const result = await service.findAll({});
		expect(result).toEqual({
			data: [],
			meta: {
				total: 0,
				page: 1,
				limit: 10,
				totalPages: 0,
				hasNextPage: false,
				hasPreviousPage: false,
			},
		});
	});
	it('should indicate the final page when no later results remain', async () => {
		prisma.expert.count.mockResolvedValue(10);
		expect(
			(await service.findAll({ page: 2, limit: 5 })).meta.hasNextPage,
		).toBe(false);
	});
	it.each([
		[new Date('2000-01-01'), 'Expired'],
		[new Date('2100-01-01'), 'Verified'],
	] as const)(
		'should preserve verification status when an expiry date exists (%p)',
		async (verifiedUntil, expected) => {
			prisma.expert.findMany.mockResolvedValue([
				{
					id: 'expert',
					user: { name: 'Example' },
					photo: null,
					gender: 'NOT_SPECIFIED',
					verifiedUntil,
				},
			]);
			expect((await service.findAll({})).data[0].verificationStatus).toBe(
				expected,
			);
		},
	);
	it('should propagate database failure when the transaction fails', async () => {
		prisma.$transaction.mockRejectedValue(new Error('Unavailable'));
		await expect(service.findAll({})).rejects.toThrow('Unavailable');
	});
	it('should preserve existing scaffold methods when invoked', () => {
		expect(service.create({})).toBe('This action adds a new expert');
		expect(service.findOne(3)).toBe('This action returns a #3 expert');
		expect(service.update(3, {})).toBe('This action updates a #3 expert');
		expect(service.remove(3)).toBe('This action removes a #3 expert');
	});
});
