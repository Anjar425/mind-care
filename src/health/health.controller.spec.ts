import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
	let controller: HealthController;
	let module: TestingModule;
	let service: jest.Mocked<Pick<HealthService, 'live' | 'ready'>>;
	beforeEach(async () => {
		service = { live: jest.fn(), ready: jest.fn() };
		module = await Test.createTestingModule({
			controllers: [HealthController],
			providers: [{ provide: HealthService, useValue: service }],
		}).compile();
		controller = module.get(HealthController);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should return availability when the process check succeeds', () => {
		service.live.mockReturnValue({ status: 'ok' });
		expect(controller.live()).toEqual({ status: 'ok' });
		expect(service.ready).not.toHaveBeenCalled();
	});
	it('should return availability when the database check succeeds', async () => {
		service.ready.mockResolvedValue({ status: 'ok' });
		await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
	});
	it('should propagate unavailability when the database check fails', async () => {
		service.ready.mockRejectedValue(new ServiceUnavailableException());
		await expect(controller.ready()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
	});
});
