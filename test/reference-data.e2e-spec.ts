import { INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import type { Server } from 'node:http';
import { ReferenceDataModule } from '@/reference-data/reference-data.module';
import { PrismaService } from '@/prisma/prisma.service';
import { ResponseInterceptor } from '@/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '@/common/guards/api-rate-limit.guard';
import { setupApplication } from '@/common/config/app.setup';
import { createReferencePrismaMock } from './reference-data-mocks';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import type { QuestionnaireResponseDto } from '@/reference-data/dto/questionnaire-response.dto';

describe('Reference questionnaire HTTP (isolated database)', () => {
	let app: INestApplication<Server>;
	let prisma: ReturnType<typeof createReferencePrismaMock>;
	let errors: jest.SpyInstance;
	beforeEach(async () => {
		prisma = createReferencePrismaMock();
		errors = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const module = await Test.createTestingModule({
			imports: [
				ReferenceDataModule,
				ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
			],
			providers: [
				runtimeConfigProvider,
				ResponseInterceptor,
				{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
			],
		})
			.overrideProvider(PrismaService)
			.useValue(prisma)
			.compile();
		app = module.createNestApplication<INestApplication<Server>>({
			logger: false,
		});
		setupApplication(app, syntheticConfig);
		await app.init();
		await app.listen(0, '127.0.0.1');
	});
	afterEach(async () => {
		await app.close();
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});
	const api = () => request(app.getHttpServer());

	it.each([
		['dass21', 'DASS21', 21],
		['dass42', 'DASS42', 42],
	] as const)(
		'should expose the complete public %s questionnaire when storage matches its release',
		async (path, instrument, count) => {
			const response = await api().get(`/references/${path}`).expect(200);
			const body = response.body as {
				statusCode: number;
				message: string;
				data: QuestionnaireResponseDto;
			};
			expect(body.statusCode).toBe(200);
			expect(body.message).toBe('Success');
			expect(body.data.instrument).toBe(instrument);
			expect(body.data.catalogVersion).toBe('prototype-candidate-v1');
			expect(body.data.questions).toHaveLength(count);
			expect(
				body.data.questions.map((question) => question.number),
			).toEqual(Array.from({ length: count }, (_, index) => index + 1));
			expect(body.data.questions[0].id).toBe(`${instrument}-Q01`);
			expect(
				body.data.questions.every(
					(question) =>
						Object.keys(question).sort().join(',') ===
						'id,number,text',
				),
			).toBe(true);
			expect(Object.keys(body.data).sort()).toEqual([
				'catalogVersion',
				'instrument',
				'questions',
			]);
		},
	);
	it.each(['dass21', 'dass42'] as const)(
		'should fail closed when the %s database catalog is empty',
		async (path) => {
			const delegate = path === 'dass21' ? prisma.dASS21 : prisma.dASS42;
			delegate.findMany.mockResolvedValue([]);
			const response = await api().get(`/references/${path}`).expect(503);
			expect(response.body).toEqual({
				statusCode: 503,
				message: ['Internal server error'],
				error: 'Service Unavailable',
			});
			expect(response.body).not.toHaveProperty('data');
		},
	);
	it('should discard private provider details when columns or database connectivity are unavailable', async () => {
		prisma.dASS21.findMany.mockRejectedValue(
			new Error('PRIVATE_DATABASE_SCHEMA_OR_CONNECTION'),
		);
		const response = await api().get('/references/dass21').expect(503);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DATABASE');
		expect(JSON.stringify(errors.mock.calls)).not.toContain(
			'PRIVATE_DATABASE',
		);
	});
	it('should reject edited reference content when the database text differs from the release', async () => {
		const rows = await prisma.dASS42.findMany({});
		rows[0].text = 'unapproved change';
		prisma.dASS42.findMany.mockResolvedValue(rows);
		await api().get('/references/dass42').expect(503);
	});
	it('should apply the existing shared quota when callers alternate questionnaire endpoints', async () => {
		for (let i = 0; i < 120; i++)
			await api()
				.get(`/references/${i % 2 ? 'dass21' : 'dass42'}`)
				.expect(200);
		const response = await api().get('/references/dass21').expect(429);
		expect(response.body).toEqual({
			statusCode: 429,
			message: ['Too many requests'],
			error: 'Too Many Requests',
		});
		expect(response.headers['retry-after']).toBeDefined();
	});
	it('should expose no write or expert-data routes when the reference module is registered', async () => {
		await api()
			.post('/references/dass21')
			.send({ text: 'unapproved' })
			.expect(404);
		await api().get('/references/experts').expect(404);
		expect(prisma.dASS21.findMany).not.toHaveBeenCalled();
		expect(prisma.dASS42.findMany).not.toHaveBeenCalled();
	});
	it('should describe public responses accurately when OpenAPI is generated', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().build(),
		);
		for (const path of ['/references/dass21', '/references/dass42']) {
			const operation = doc.paths[path].get!;
			expect(operation.security).toBeUndefined();
			expect(Object.keys(operation.responses).sort()).toEqual([
				'200',
				'429',
				'500',
				'503',
			]);
			expect(operation.summary).toBeDefined();
		}
		expect(doc.components?.schemas?.QuestionResponseDto).toEqual(
			expect.objectContaining({ required: ['id', 'number', 'text'] }),
		);
		expect(doc.components?.schemas?.QuestionnaireResponseDto).toEqual(
			expect.objectContaining({
				required: ['instrument', 'catalogVersion', 'questions'],
			}),
		);
	});
});
