import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
	let interceptor: ResponseInterceptor;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ResponseInterceptor,
				{
					provide: Reflector,
					useValue: {
						get: jest.fn(),
					},
				},
			],
		}).compile();

		interceptor = module.get(ResponseInterceptor);
	});

	it('should be defined', () => {
		expect(interceptor).toBeDefined();
	});
});
