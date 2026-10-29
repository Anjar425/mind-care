import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { ExpertController } from './expert.controller';
import { ExpertService } from './expert.service';

describe('ExpertController', () => {
	let controller: ExpertController;
	let module: TestingModule;
	let service: jest.Mocked<
		Pick<
			ExpertService,
			'create' | 'findAll' | 'findOne' | 'update' | 'remove'
		>
	>;
	beforeEach(async () => {
		service = {
			create: jest.fn(),
			findAll: jest.fn(),
			findOne: jest.fn(),
			update: jest.fn(),
			remove: jest.fn(),
		};
		module = await Test.createTestingModule({
			controllers: [ExpertController],
			providers: [{ provide: ExpertService, useValue: service }],
		}).compile();
		controller = module.get(ExpertController);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should forward pagination when the list is requested', async () => {
		const pagination = { page: 2, limit: 5 };
		await controller.findAll(pagination);
		expect(service.findAll).toHaveBeenCalledWith(pagination);
	});
	it('should transform query strings and pass defaults when pagination is validated', async () => {
		const pipe = new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		});
		const pagination: unknown = await pipe.transform(
			{ page: '2', limit: '5' },
			{ type: 'query', metatype: PaginationDto },
		);
		if (!(pagination instanceof PaginationDto))
			throw new Error('Invalid DTO transformation');
		await controller.findAll(pagination);
		expect(service.findAll).toHaveBeenCalledWith({ page: 2, limit: 5 });
		const defaults: unknown = await pipe.transform(
			{},
			{ type: 'query', metatype: PaginationDto },
		);
		expect(defaults).toEqual({ page: 1, limit: 10 });
	});
	it.each([
		{ page: '0' },
		{ limit: '-1' },
		{ page: '1.5' },
		{ limit: 'bad' },
	])(
		'should reject pagination when query values are invalid (%p)',
		async (input) => {
			const pipe = new ValidationPipe({
				transform: true,
				whitelist: true,
				forbidNonWhitelisted: true,
			});
			await expect(
				pipe.transform(input, {
					type: 'query',
					metatype: PaginationDto,
				}),
			).rejects.toThrow();
		},
	);
	it('should propagate service failures when listing fails', async () => {
		service.findAll.mockRejectedValue(new Error('Unavailable'));
		await expect(controller.findAll({})).rejects.toThrow('Unavailable');
	});
	it('should preserve create forwarding when the existing scaffold is used', () => {
		controller.create({});
		expect(service.create).toHaveBeenCalledWith({});
	});
	it('should preserve existing id forwarding when scaffold methods are called', () => {
		controller.findOne('3');
		controller.update('3', {});
		controller.remove('3');
		expect(service.findOne).toHaveBeenCalledWith(3);
		expect(service.update).toHaveBeenCalledWith(3, {});
		expect(service.remove).toHaveBeenCalledWith(3);
	});
});
