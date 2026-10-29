import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthIndicatorService, TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';
import { runtimeConfigProvider } from '../../test/runtime-config.mock';

describe('HealthService', () => {
	let module: TestingModule;
	let service: HealthService;
	const query = jest.fn<Promise<unknown>, [TemplateStringsArray]>();
	const indicator = {
		up: jest.fn().mockReturnValue({ database: { status: 'up' } }),
		down: jest.fn().mockReturnValue({ database: { status: 'down' } }),
	};
	const check = jest.fn().mockReturnValue(indicator);
	beforeEach(async () => {
		query.mockReset();
		module = await Test.createTestingModule({
			imports: [TerminusModule.forRoot({ logger: false })],
			providers: [
				runtimeConfigProvider,
				HealthService,
				{ provide: PrismaService, useValue: { $queryRaw: query } },
				{ provide: HealthIndicatorService, useValue: { check } },
			],
		}).compile();
		service = module.get(HealthService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		jest.useRealTimers();
		await module.close();
	});
	it('should avoid database calls when checking liveness', () => {
		expect(service.live()).toEqual({ status: 'ok' });
		expect(query).not.toHaveBeenCalled();
	});
	it('should return a minimal result when the database responds', async () => {
		query.mockResolvedValue([{ '?column?': 1 }]);
		await expect(service.ready()).resolves.toEqual({ status: 'ok' });
		expect(query).toHaveBeenCalledWith(['SELECT 1']);
		expect(indicator.up).toHaveBeenCalledWith();
	});
	it('should discard provider details when the database rejects', async () => {
		query.mockRejectedValue(new Error('synthetic-private-connection'));
		await expect(service.ready()).rejects.toEqual(
			new ServiceUnavailableException('Service unavailable'),
		);
		expect(indicator.down).toHaveBeenCalledWith();
	});
	it('should time out when the database never responds', async () => {
		jest.useFakeTimers();
		query.mockReturnValue(new Promise(() => undefined));
		const assertion = expect(service.ready()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
		await jest.advanceTimersByTimeAsync(1000);
		await assertion;
	});
});
