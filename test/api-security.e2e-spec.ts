import { Controller, Get, INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { AuthExceptionFilter } from '@/auth/auth-exception.filter';
import { ApiRateLimitGuard } from '@/common/guards/api-rate-limit.guard';
import { setupApplication } from '@/common/config/app.setup';
import { setupSwagger } from '@/common/config/swagger/setup-swagger';
import { ResponseInterceptor } from '@/common/interceptor/response/response.interceptor';
import { HttpExceptionFilter } from '@/common/filter/http-exception/http-exception.filter';
import { HealthController } from '@/health/health.controller';
import { HealthService } from '@/health/health.service';
import { PrismaService } from '@/prisma/prisma.service';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';

@Controller('security-test')
class TestController {
	@Get('a') a() {
		return { ok: true };
	}
	@Get('b') b() {
		return { ok: true };
	}
}

describe('Local HTTP security (isolated database/mail)', () => {
	let app: INestApplication<Server>;
	let errorLog: jest.SpyInstance;
	const query = jest.fn();
	const login = jest.fn();
	async function create(mode: 'test' | 'production' = 'test') {
		const module = await Test.createTestingModule({
			imports: [
				ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
				TerminusModule.forRoot({ logger: false }),
			],
			controllers: [AuthController, HealthController, TestController],
			providers: [
				runtimeConfigProvider,
				ResponseInterceptor,
				AuthExceptionFilter,
				HealthService,
				{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
				{ provide: PrismaService, useValue: { $queryRaw: query } },
				{
					provide: AuthService,
					useValue: {
						login,
						register: jest
							.fn()
							.mockResolvedValue({ user: { id: 'synthetic' } }),
						forgotPassword: jest.fn().mockResolvedValue(undefined),
						sendVerificationEmail: jest
							.fn()
							.mockResolvedValue(undefined),
					},
				},
			],
		}).compile();
		app = module.createNestApplication<INestApplication<Server>>({
			logger: false,
		});
		if (mode === 'production') {
			// Exercise documentation registration independently: production bootstrap itself is gated.
			app.useGlobalFilters(new HttpExceptionFilter());
			setupSwagger(app, mode);
		} else
			setupApplication(app, {
				NODE_ENV: mode,
				CORS_ORIGIN: syntheticConfig.CORS_ORIGIN,
			});
		await app.init();
		await app.listen(0, '127.0.0.1');
	}
	beforeEach(async () => {
		query.mockReset().mockResolvedValue([{ value: 1 }]);
		login.mockReset().mockResolvedValue({ ok: true });
		errorLog = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		await create();
	});
	afterEach(async () => {
		await app.close();
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});
	const api = () => request(app.getHttpServer());
	const credentials = { email: 'test@example.test', password: 'Passw0rd123' };

	it('should permit the temporary frontend when bearer preflight is requested', async () => {
		const response = await api()
			.options('/auth/login')
			.set('Origin', 'http://localhost:5173')
			.set('Access-Control-Request-Method', 'POST')
			.set('Access-Control-Request-Headers', 'authorization,content-type')
			.expect(204);
		expect(response.headers['access-control-allow-origin']).toBe(
			'http://localhost:5173',
		);
		expect(response.headers['access-control-allow-headers']).toBe(
			'Content-Type,Authorization',
		);
		expect(
			response.headers['access-control-allow-credentials'],
		).toBeUndefined();
	});
	it.each([
		'http://127.0.0.1:5173',
		'https://unapproved.example.test',
		'null',
	])(
		'should withhold matching CORS permission when the origin is %s',
		async (origin) => {
			const response = await api()
				.get('/health/live')
				.set('Origin', origin)
				.expect(200);
			expect(
				response.headers['access-control-allow-origin'],
			).toBeUndefined();
		},
	);
	it('should set local Helmet headers when a health response is sent', async () => {
		const response = await api().get('/health/live').expect(200);
		expect(response.headers['x-content-type-options']).toBe('nosniff');
		expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
		expect(response.headers['x-powered-by']).toBeUndefined();
		expect(response.headers['strict-transport-security']).toBeUndefined();
		expect(response.headers['content-security-policy']).not.toContain(
			'upgrade-insecure-requests',
		);
	});
	it('should serve Swagger and its assets when development documentation is enabled', async () => {
		await api().get('/docs/').expect(200).expect('Content-Type', /html/);
		await api().get('/docs/swagger-ui-bundle.js').expect(200);
		await api().get('/docs/swagger-ui.css').expect(200);
		const init = await api().get('/docs/swagger-ui-init.js').expect(200);
		expect(init.text).toContain('"persistAuthorization": false');
		const schema = await api().get('/docs-json').expect(200);
		const body = schema.body as {
			paths: Record<
				string,
				{ post?: { responses: Record<string, unknown> } }
			>;
		};
		expect(body.paths['/auth/login'].post?.responses).toHaveProperty('429');
		expect(body.paths).toHaveProperty('/health/ready');
	});
	it('should omit UI and raw schemas when production documentation gating is selected', async () => {
		await app.close();
		await create('production');
		for (const path of [
			'/docs',
			'/docs/',
			'/docs-json',
			'/docs-yaml',
			'/docs/swagger-ui-bundle.js',
		])
			await api().get(path).expect(404);
	});
	it('should enforce the shared login limit when endpoints, casing and slashes vary', async () => {
		for (const path of [
			'/auth/login',
			'/auth/expert/login',
			'/auth/admin/login',
			'/AUTH/LOGIN/',
			'/auth/login',
		])
			await api().post(path).send(credentials).expect(200);
		const response = await api()
			.post('/auth/expert/login')
			.send(credentials)
			.expect(429);
		expect(response.body).toEqual({
			statusCode: 429,
			message: ['Too many requests'],
			error: 'Too Many Requests',
		});
		expect(response.headers['retry-after']).toBeDefined();
		expect(login).toHaveBeenCalledTimes(5);
	});
	it('should share registration quota when ordinary and expert endpoints alternate', async () => {
		const body = {
			...credentials,
			name: 'Example',
			confirm_password: credentials.password,
		};
		for (const path of [
			'/auth/user/register',
			'/auth/expert/register',
			'/auth/user/register',
		])
			await api().post(path).send(body).expect(201);
		await api().post('/auth/expert/register').send(body).expect(429);
	});
	it('should combine general quotas when requests use different endpoints', async () => {
		for (let i = 0; i < 120; i++)
			await api()
				.get(`/security-test/${i % 2 ? 'a' : 'b'}`)
				.expect(200);
		await api().get('/health/live').expect(429);
	});
	it('should ignore spoofed forwarded addresses when the same peer exhausts its quota', async () => {
		for (let i = 0; i < 5; i++)
			await api()
				.post('/auth/login')
				.set('X-Forwarded-For', `192.0.2.${i + 1}`)
				.send(credentials)
				.expect(200);
		await api()
			.post('/auth/login')
			.set('X-Forwarded-For', '192.0.2.99')
			.send(credentials)
			.expect(429);
	});
	it('should keep liveness independent when the database is unavailable', async () => {
		query.mockRejectedValue(new Error('synthetic-private-database-url'));
		const live = await api().get('/health/live').expect(200);
		expect(live.body).toEqual({
			statusCode: 200,
			message: 'Success',
			data: { status: 'ok' },
		});
		expect(query).not.toHaveBeenCalled();
		const ready = await api().get('/health/ready').expect(503);
		expect(ready.body).toEqual({
			statusCode: 503,
			message: ['Internal server error'],
			error: 'Service Unavailable',
		});
		expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
			'synthetic-private-database-url',
		);
	});
	it('should return readiness without provider details when the database responds', async () => {
		const response = await api().get('/health/ready').expect(200);
		expect(response.body).toEqual({
			statusCode: 200,
			message: 'Success',
			data: { status: 'ok' },
		});
	});
});
