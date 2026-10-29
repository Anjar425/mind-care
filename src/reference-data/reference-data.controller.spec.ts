import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceDataController } from './reference-data.controller';
import { ReferenceDataService } from './reference-data.service';

describe('ReferenceDataController', () => {
	let module: TestingModule;
	let controller: ReferenceDataController;
	let service: jest.Mocked<Pick<ReferenceDataService, 'getQuestionnaire'>>;
	beforeEach(async () => {
		service = { getQuestionnaire: jest.fn() };
		module = await Test.createTestingModule({
			controllers: [ReferenceDataController],
			providers: [{ provide: ReferenceDataService, useValue: service }],
		}).compile();
		controller = module.get(ReferenceDataController);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it.each(['DASS21', 'DASS42'] as const)(
		'should delegate to its own instrument when %s is requested',
		async (instrument) => {
			const result = {
				instrument,
				catalogVersion: 'prototype-candidate-v1',
				questions: [],
			};
			service.getQuestionnaire.mockResolvedValue(result);
			await expect(
				instrument === 'DASS21'
					? controller.dass21()
					: controller.dass42(),
			).resolves.toEqual(result);
			expect(service.getQuestionnaire).toHaveBeenCalledWith(instrument);
		},
	);
	it.each(['DASS21', 'DASS42'] as const)(
		'should propagate availability failure when %s service rejects',
		async (instrument) => {
			service.getQuestionnaire.mockRejectedValue(
				new ServiceUnavailableException(),
			);
			await expect(
				instrument === 'DASS21'
					? controller.dass21()
					: controller.dass42(),
			).rejects.toBeInstanceOf(ServiceUnavailableException);
		},
	);
});
