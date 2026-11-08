import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtStrategy } from '../src/api/common/auth/jwt.strategy';
import { AuthSessionService } from '../src/domain/identity/auth-session.service';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { ResponseInterceptor } from '../src/api/common/interceptors/response.interceptor';
import { setupApplication } from '../src/api/app.setup';
import { ApiRateLimitGuard } from '../src/api/common/rate-limit/api-rate-limit.guard';
import { ScreeningsController } from '../src/api/public/screenings/screenings.controller';
import { ScreeningsService } from '../src/domain/screening/screenings.service';
import { ScreeningPresentationService } from '../src/domain/screening/screening-presentation.service';
import { OptionalScreeningAuthGuard } from '../src/api/public/screenings/optional-screening-auth.guard';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { QdssEvaluationService } from '../src/domain/qdss/qdss-evaluation.service';
import { Dass42InferenceService } from '../src/domain/dass42/dass42-inference.service';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import {
	publicDass42Input,
	publicQdssInput,
	realScreeningFixture,
} from './screening-mocks';
import { groupUserId } from './groups-mocks';
import { qdssAdmin } from './qdss-mocks';

describe('Public screening HTTP with real JWT/session and numerical services; synthetic storage', () => {
	let app: INestApplication<Server>;
	let f: Awaited<ReturnType<typeof realScreeningFixture>>;
	let jwt: JwtService;
	beforeEach(async () => {
		f = await realScreeningFixture();
		const module = await Test.createTestingModule({
			imports: [
				PassportModule,
				JwtModule.register({
					secret: syntheticConfig.JWT_ACCESS_SECRET,
				}),
				ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
			],
			controllers: [ScreeningsController],
			providers: [
				ScreeningsService,
				ScreeningPresentationService,
				OptionalScreeningAuthGuard,
				AuthSessionService,
				JwtStrategy,
				ResponseInterceptor,
				runtimeConfigProvider,
				{ provide: PrismaService, useValue: f.prisma },
				{ provide: ReferenceDataService, useValue: f.q.reference },
				{ provide: QdssEvaluationService, useValue: f.q.evaluation },
				{ provide: Dass42InferenceService, useValue: f.d.inference },
				{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
			],
		}).compile();
		jwt = module.get(JwtService);
		app = module.createNestApplication<INestApplication<Server>>({
			logger: false,
		});
		setupApplication(app, syntheticConfig);
		await app.init();
		await app.listen(0, '127.0.0.1');
	});
	afterEach(async () => {
		await app?.close();
		jest.restoreAllMocks();
	});
	const api = () => request(app.getHttpServer());
	const token = (
		userId = groupUserId(1),
		role = 'EXPERT',
		expiresIn: number = 900,
	) => {
		const sid = 'screening-session-' + userId;
		f.sessions.set(sid, {
			userId,
			expiresAt: new Date(Date.now() + 60000),
		});
		return jwt.sign(
			{ sub: userId, sid, jti: 'synthetic-jti', role, type: 'access' },
			{ expiresIn },
		);
	};
	const post = (engine: string, body: unknown) =>
		api()
			.post('/api/v1/screenings/' + engine)
			.send(body as object);
	it('should allow guest GLOBAL/GROUP QDSS and GROUP DASS42 without changing calibration or rules', async () => {
		const before = JSON.stringify({
			runs: f.q.m.state,
			rules: f.d.m.state,
		});
		for (const input of [publicQdssInput(), publicQdssInput(true)]) {
			const r = await post('qdss', input).expect(200);
			const data = (r.body as { data: Record<string, unknown> }).data;
			expect(data).toMatchObject({
				audience: 'GUEST',
				accountId: null,
				presentation: { consultationRecommended: false },
			});
			expect(data).not.toHaveProperty('answers');
			expect(r.headers['cache-control']).toBe('no-store');
		}
		const d = await post('dass42', publicDass42Input()).expect(200);
		expect((d.body as { data: object }).data).toMatchObject({
			instrument: 'DASS42_MAMDANI',
			audience: 'GUEST',
			context: { scope: 'GROUP', group: { id: 1 } },
		});
		expect(JSON.stringify({ runs: f.q.m.state, rules: f.d.m.state })).toBe(
			before,
		);
	});
	it('should bind valid account responses to the authenticated account without saving plaintext history', async () => {
		const r = await post('qdss', publicQdssInput())
			.auth(token(), { type: 'bearer' })
			.expect(200);
		expect((r.body as { data: object }).data).toMatchObject({
			audience: 'ACCOUNT',
			accountId: groupUserId(1),
		});
		expect(f.prisma).not.toHaveProperty('historyEntry');
	});
	it('should reject supplied invalid, expired and revoked credentials instead of running as guest', async () => {
		for (const credential of [
			'invalid-token',
			token(groupUserId(1), 'EXPERT', -1),
		]) {
			const r = await post('qdss', publicQdssInput())
				.auth(credential, { type: 'bearer' })
				.expect(401);
			expect(r.headers['cache-control']).toBe('no-store');
		}
		const revoked = token();
		f.sessions.clear();
		await post('qdss', publicQdssInput())
			.auth(revoked, { type: 'bearer' })
			.expect(401);
		await post('qdss', publicQdssInput())
			.set('Authorization', 'Basic private')
			.expect(401);
	});
	it('should deny current administrators', async () => {
		await post('dass42', publicDass42Input())
			.auth(token(qdssAdmin, 'ADMIN'), { type: 'bearer' })
			.expect(403);
	});
	it('should reject stale catalogs, incoherent scopes and private extra fields with redacted responses', async () => {
		await post('qdss', {
			...publicQdssInput(),
			catalogVersion: 'old-catalog',
		}).expect(409);
		await post('qdss', { ...publicQdssInput(), groupId: 1 }).expect(400);
		const r = await post('dass42', {
			...publicDass42Input(),
			'private patient field': 'sensitive response',
		}).expect(400);
		expect(JSON.stringify(r.body)).not.toMatch(
			/private patient|sensitive response/,
		);
	});
	it('should reject missing and archived groups without falling back to GLOBAL', async () => {
		await post('qdss', { ...publicQdssInput(true), groupId: 98765 }).expect(
			404,
		);
		await post('dass42', { ...publicDass42Input(), groupId: 98765 }).expect(
			404,
		);
		f.q.m.groups.state.groups[0].archivedAt = new Date();
		await post('qdss', publicQdssInput(true)).expect(404);
		await post('dass42', publicDass42Input()).expect(404);
	});
	it('should bound and redact malformed, oversized and compressed requests before parsing', async () => {
		for (const [body, status, encoding, code] of [
			[
				JSON.stringify({ private: 'x'.repeat(17000) }),
				413,
				'identity',
				'SCREENING_TOO_LARGE',
			],
			[
				'{"private answer":',
				400,
				'identity',
				'SCREENING_INVALID_REQUEST',
			],
			['{}', 415, 'gzip', 'UNSUPPORTED_MEDIA_TYPE'],
		] as const) {
			const r = await api()
				.post('/api/v1/screenings/qdss')
				.set('Content-Type', 'application/json')
				.set('Content-Encoding', encoding)
				.send(body)
				.expect(status);
			expect(r.headers['cache-control']).toBe('no-store');
			expect(r.body).toHaveProperty('code', code);
			expect(JSON.stringify(r.body)).not.toContain('private answer');
		}
	});
	it('should enforce independent canonical QDSS and DASS42 action buckets alongside the general limit', async () => {
		for (let i = 0; i < 10; i++)
			await post('qdss', publicQdssInput()).expect(200);
		const q = await api()
			.post('/api/v1/SCREENINGS/QDSS/')
			.send(publicQdssInput())
			.expect(429);
		expect(q.headers['retry-after']).toBeDefined();
		expect(q.headers['cache-control']).toBe('no-store');
		for (let i = 0; i < 5; i++)
			await post('dass42', publicDass42Input()).expect(200);
		await post('dass42', publicDass42Input()).expect(429);
	});
	it('should document anonymous OR named access-token auth and typed 200 responses', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder()
				.addBearerAuth(undefined, 'access-token')
				.build(),
		);
		for (const path of [
			'/api/v1/screenings/qdss',
			'/api/v1/screenings/dass42',
		]) {
			const op = doc.paths[path].post!;
			expect(op.security).toEqual([{}, { 'access-token': [] }]);
			expect(op.responses).toHaveProperty('200');
			expect(op.responses).not.toHaveProperty('201');
			expect(op.responses).toHaveProperty('413');
		}
		expect(JSON.stringify(doc.paths)).not.toContain('decrypt');
	});
});
