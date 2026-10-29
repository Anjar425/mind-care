import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
	let interceptor: ResponseInterceptor;
	let module: TestingModule;
	let reflector: { get: jest.Mock<unknown, unknown[]> };
	let context: ExecutionContext;
	beforeEach(async () => {
		reflector = { get: jest.fn<unknown, unknown[]>() };
		module = await Test.createTestingModule({
			providers: [
				ResponseInterceptor,
				{ provide: Reflector, useValue: reflector },
			],
		}).compile();
		interceptor = module.get(ResponseInterceptor);
		context = {
			switchToHttp: () => ({ getResponse: () => ({ statusCode: 201 }) }),
			getHandler: () => function handler() {},
		} as unknown as ExecutionContext;
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it.each([{ value: 1 }, [], false, 0, ''])(
		'should preserve payload values when successful data is %p',
		async (data) => {
			reflector.get.mockReturnValue('Created');
			expect(
				await firstValueFrom(
					interceptor.intercept(context, { handle: () => of(data) }),
				),
			).toEqual({ statusCode: 201, message: 'Created', data });
		},
	);
	it.each([undefined, null])(
		'should omit data when the operation returns %p',
		async (data) => {
			expect(
				await firstValueFrom(
					interceptor.intercept(context, { handle: () => of(data) }),
				),
			).toEqual({ statusCode: 201, message: 'Success' });
		},
	);
	it.each([undefined, null, ['legacy'], 1])(
		'should keep the default message a string when metadata is not a string (%p)',
		async (metadata) => {
			reflector.get.mockReturnValue(metadata);
			expect(
				await firstValueFrom(
					interceptor.intercept(context, { handle: () => of({}) }),
				),
			).toHaveProperty('message', 'Success');
		},
	);
	it('should leave errors to the exception filter when the handler fails', async () => {
		const error = new Error('Controlled');
		await expect(
			firstValueFrom(
				interceptor.intercept(context, {
					handle: () => throwError(() => error),
				}),
			),
		).rejects.toBe(error);
	});
});
