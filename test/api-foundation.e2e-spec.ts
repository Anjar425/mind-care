import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpException,
	INestApplication,
	Logger,
	Param,
	Post,
	ServiceUnavailableException,
	ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';
import type { Server } from 'node:http';
import request from 'supertest';
import { ApiCommonResponse } from '@/common/decorator/api/api-common-response.decorator';
import { MessageResponse } from '@/common/decorator/api/message-response.decorator';
import { HttpExceptionFilter } from '@/common/filter/http-exception/http-exception.filter';
import { ResponseInterceptor } from '@/common/interceptor/response/response.interceptor';

class SampleDto {
	@ApiProperty({
		description: 'Submitted integer, without rescaling',
		example: 4,
	})
	@IsInt()
	value!: number;
	@ApiProperty({
		description: 'Submitted text, without trimming',
		example: '  Keep Case  ',
	})
	@IsString()
	note!: string;
}
@Controller('fixture')
class FixtureController {
	@Get('object')
	@MessageResponse('Listed')
	@ApiCommonResponse([200], { model: SampleDto })
	object() {
		return { value: 4, note: '  Keep Case  ' };
	}
	@Get('default')
	@ApiCommonResponse([200])
	defaults() {
		return false;
	}
	@Get('empty')
	@MessageResponse('Empty')
	@ApiCommonResponse([200], { model: SampleDto, isArray: true })
	empty() {
		return [];
	}
	@Get('no-data')
	@MessageResponse('Completed')
	@ApiCommonResponse([200])
	noData() {
		return undefined;
	}
	@Post('create')
	@MessageResponse('Created')
	@ApiCommonResponse([201, 400], { model: SampleDto })
	create(@Body() body: SampleDto) {
		return body;
	}
	@Get('no-content')
	@HttpCode(204)
	@ApiCommonResponse([204])
	noContent() {
		return undefined;
	}
	@Get('error/:status')
	error(@Param('status') status: string) {
		throw new HttpException(
			{ message: 'Controlled rejection', error: 'Rejected' },
			Number(status),
		);
	}
	@Get('crash')
	crash() {
		throw new Error('PRIVATE_DB_CONNECTION');
	}
	@Get('unavailable')
	unavailable() {
		throw new ServiceUnavailableException('PRIVATE_PROVIDER');
	}
}

describe('Shared API HTTP contracts', () => {
	let app: INestApplication<Server>;
	let log: jest.SpyInstance;
	beforeEach(async () => {
		log = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const module = await Test.createTestingModule({
			controllers: [FixtureController],
			providers: [ResponseInterceptor, Reflector],
		}).compile();
		app = module.createNestApplication<INestApplication<Server>>({
			logger: false,
		});
		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				forbidNonWhitelisted: true,
				transform: true,
			}),
		);
		app.useGlobalInterceptors(module.get(ResponseInterceptor));
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.listen(0, '127.0.0.1');
	});
	afterEach(async () => {
		await app.close();
		jest.clearAllMocks();
		jest.restoreAllMocks();
	});
	it('should return scalar messages and preserve data when a decorated endpoint succeeds', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/object')
			.expect(200);
		expect(response.body).toEqual({
			statusCode: 200,
			message: 'Listed',
			data: { value: 4, note: '  Keep Case  ' },
		});
	});
	it('should preserve false when no message override is declared', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/default')
			.expect(200);
		expect(response.body).toEqual({
			statusCode: 200,
			message: 'Success',
			data: false,
		});
	});
	it('should retain an empty array when a list has no results', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/empty')
			.expect(200);
		expect(response.body).toEqual({
			statusCode: 200,
			message: 'Empty',
			data: [],
		});
	});
	it('should omit data when the service has no result', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/no-data')
			.expect(200);
		expect(response.body).toEqual({
			statusCode: 200,
			message: 'Completed',
		});
	});
	it('should preserve submitted values when validated data is returned with 201', async () => {
		const response = await request(app.getHttpServer())
			.post('/fixture/create')
			.send({ value: 4, note: '  Keep Case  ' })
			.expect(201);
		expect(response.body).toEqual({
			statusCode: 201,
			message: 'Created',
			data: { value: 4, note: '  Keep Case  ' },
		});
	});
	it('should produce no response body when status is 204', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/no-content')
			.expect(204);
		expect(response.text).toBe('');
	});
	it.each([400, 401, 403, 404, 409])(
		'should preserve controlled status and array messages when status is %p',
		async (status) => {
			const response = await request(app.getHttpServer())
				.get(`/fixture/error/${status}`)
				.expect(status);
			expect(response.body).toEqual({
				statusCode: status,
				message: ['Controlled rejection'],
				error: 'Rejected',
			});
		},
	);
	it.each([
		['crash', 500],
		['unavailable', 503],
	] as const)(
		'should hide server details when %s fails',
		async (path, status) => {
			const response = await request(app.getHttpServer())
				.get(`/fixture/${path}`)
				.expect(status);
			expect((response.body as { message: string[] }).message).toEqual([
				'Internal server error',
			]);
			expect(JSON.stringify(response.body)).not.toContain('PRIVATE');
			expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE');
		},
	);
	it('should reject invalid fields without returning submitted values when validation fails', async () => {
		const response = await request(app.getHttpServer())
			.post('/fixture/create')
			.send({ value: 'PRIVATE_VALUE', note: 'Text' })
			.expect(400);
		expect((response.body as { message: string[] }).message).toContain(
			'value must be an integer number',
		);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_VALUE');
	});
	it('should reject extra properties when whitelist enforcement runs', async () => {
		const response = await request(app.getHttpServer())
			.post('/fixture/create')
			.send({ value: 4, note: 'Text', extra: 'PRIVATE_VALUE' })
			.expect(400);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_VALUE');
	});
	it('should not echo URL tokens when an unknown route returns 404', async () => {
		const response = await request(app.getHttpServer())
			.get('/fixture/missing?token=PRIVATE_TOKEN')
			.expect(404);
		expect((response.body as { message: string[] }).message).toEqual([
			'Resource not found',
		]);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_TOKEN');
	});
	it('should document the same message types when Swagger is generated', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().build(),
		);
		expect(doc.components?.schemas?.SuccessResponseDto).toHaveProperty(
			'properties.message.type',
			'string',
		);
		expect(doc.components?.schemas?.ErrorResponseDto).toHaveProperty(
			'properties.message.type',
			'array',
		);
		expect(
			doc.paths['/fixture/no-content'].get?.responses['204'],
		).not.toHaveProperty('content');
	});
});
