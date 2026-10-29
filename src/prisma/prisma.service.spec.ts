import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import {
	runtimeConfigProvider,
	syntheticConfig,
} from '../../test/runtime-config.mock';
import { PrismaPg } from '@prisma/adapter-pg';

jest.unmock('@/prisma/prisma.service');
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('./generated/client', () => ({
	PrismaClient: class {
		$connect = jest.fn().mockResolvedValue(undefined);
		$disconnect = jest.fn().mockResolvedValue(undefined);
	},
}));

describe('PrismaService', () => {
	let service: PrismaService;
	let module: TestingModule;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [PrismaService, runtimeConfigProvider],
		}).compile();
		service = module.get(PrismaService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should use injected database configuration when the adapter is created', () => {
		expect(PrismaPg).toHaveBeenCalledWith({
			connectionString: syntheticConfig.DATABASE_URL,
		});
	});
	it('should connect when module initialization runs', async () => {
		const connect = jest.spyOn(service, '$connect');
		await service.onModuleInit();
		expect(connect).toHaveBeenCalledTimes(1);
	});
	it('should disconnect when module destruction runs', async () => {
		const disconnect = jest.spyOn(service, '$disconnect');
		await service.onModuleDestroy();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
	it('should propagate startup failure when the database connection fails', async () => {
		jest.spyOn(service, '$connect').mockRejectedValue(
			new Error('synthetic-failure'),
		);
		await expect(service.onModuleInit()).rejects.toThrow(
			'Database initialization failed',
		);
	});
});
