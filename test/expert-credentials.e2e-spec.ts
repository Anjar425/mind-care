import {
	ExecutionContext,
	INestApplication,
	UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { ExpertCredentialsController } from '../src/expert-credentials/expert-credentials.controller';
import { AdminCredentialsController } from '../src/expert-credentials/admin-credentials.controller';
import { ExpertCredentialsService } from '../src/expert-credentials/expert-credentials.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/auth/guards/verified-email.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '../src/common/guards/api-rate-limit.guard';
import { setupApplication } from '../src/common/config/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import { ownerId, revisionId } from './credential-mocks';

describe('Credential HTTP contracts (synthetic auth/database/storage)', () => {
	let app: INestApplication<Server>;
	const service = {
		state: jest.fn(),
		submit: jest.fn(),
		download: jest.fn(),
		queue: jest.fn(),
		detail: jest.fn(),
		review: jest.fn(),
		setSuspension: jest.fn(),
	};
	const userLookup = jest.fn();
	beforeEach(async () => {
		service.state.mockResolvedValue({
			version: 0,
			credentialEligible: false,
			reasons: ['CREDENTIALS_UNSUBMITTED'],
			suspended: false,
			revisions: [],
		});
		service.submit.mockResolvedValue({
			version: 1,
			credentialEligible: false,
			reasons: ['SIP_APPROVAL_REQUIRED'],
			suspended: false,
			revisions: [],
		});
		service.queue.mockResolvedValue({ items: [], skip: 0, take: 20 });
		service.detail.mockResolvedValue({ id: revisionId });
		service.review.mockResolvedValue({ version: 2 });
		service.setSuspension.mockResolvedValue({ version: 2 });
		service.download.mockResolvedValue({
			bytes: Buffer.from('%PDF-synthetic'),
			mime: 'application/pdf',
			filename: 'safe.pdf',
		});
		userLookup.mockResolvedValue({
			role: 'EXPERT',
			email_verified_at: new Date(),
		});
		const module = await Test.createTestingModule({
			imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
			controllers: [
				ExpertCredentialsController,
				AdminCredentialsController,
			],
			providers: [
				RolesGuard,
				VerifiedEmailGuard,
				runtimeConfigProvider,
				ResponseInterceptor,
				{ provide: ExpertCredentialsService, useValue: service },
				{
					provide: PrismaService,
					useValue: { user: { findUnique: userLookup } },
				},
				{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
			],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({
				canActivate: (context: ExecutionContext) => {
					const http = context.switchToHttp();
					const req = http.getRequest<{
						headers: Record<string, string>;
						user?: { sub: string; role: string };
					}>();
					const role = req.headers['x-test-role'];
					if (!role) throw new UnauthorizedException();
					req.user = { sub: ownerId, role };
					return true;
				},
			})
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
		jest.clearAllMocks();
	});
	const api = () => request(app.getHttpServer());
	const upload = (kind = 'STR') =>
		api()
			.post(`/expert/me/credentials/${kind}`)
			.set('x-test-role', 'EXPERT')
			.field('number', 'STR-123')
			.field('holderName', 'Example Expert')
			.field('expiryDate', '2090-01-01')
			.field('expectedVersion', '0')
			.attach('file', Buffer.from('%PDF-synthetic'), {
				filename: 'document.pdf',
				contentType: 'application/pdf',
			});
	it('should return 401 when no session is present', async () => {
		await api().get('/expert/me/credentials').expect(401);
		expect(service.state).not.toHaveBeenCalled();
	});
	it.each(['USER', 'ADMIN'])(
		'should deny owner routes to %s',
		async (role) => {
			await api()
				.get('/expert/me/credentials')
				.set('x-test-role', role)
				.expect(403);
			expect(service.state).not.toHaveBeenCalled();
		},
	);
	it('should return an enveloped owned state without public listing', async () => {
		const result = await api()
			.get('/expert/me/credentials')
			.set('x-test-role', 'EXPERT')
			.expect(200);
		expect(result.body).toEqual({
			statusCode: 200,
			message: 'Success',
			data: {
				version: 0,
				credentialEligible: false,
				reasons: ['CREDENTIALS_UNSUBMITTED'],
				suspended: false,
				revisions: [],
			},
		});
		await api().get('/expert').expect(404);
	});
	it('should accept validated multipart metadata and preserve the exact original values', async () => {
		await upload().expect(201);
		expect(service.submit).toHaveBeenCalledWith(
			ownerId,
			'STR',
			expect.objectContaining({
				number: 'STR-123',
				expectedVersion: 0,
			}) as unknown,
			expect.objectContaining({
				buffer: Buffer.from('%PDF-synthetic'),
			}) as unknown,
		);
	});
	it('should deny unverified uploads before multipart storage', async () => {
		userLookup.mockResolvedValue({
			role: 'EXPERT',
			email_verified_at: null,
		});
		await upload().expect(403);
		expect(service.submit).not.toHaveBeenCalled();
	});
	it('should reject unknown document types', async () => {
		await upload('OTHER').expect(400);
		expect(service.submit).not.toHaveBeenCalled();
	});
	it('should reject expertId or approval injection in multipart fields', async () => {
		await api()
			.post('/expert/me/credentials/STR')
			.set('x-test-role', 'EXPERT')
			.field('expertId', 'other')
			.field('number', 'STR-123')
			.field('holderName', 'Example')
			.field('expiryDate', '2090-01-01')
			.field('expectedVersion', '0')
			.expect(400);
		expect(service.submit).not.toHaveBeenCalled();
	});
	it('should reject files exceeding 5 MiB before invoking the service', async () => {
		await api()
			.post('/expert/me/credentials/STR')
			.set('x-test-role', 'EXPERT')
			.attach('file', Buffer.alloc(5242881), {
				filename: 'large.pdf',
				contentType: 'application/pdf',
			})
			.expect(413);
		expect(service.submit).not.toHaveBeenCalled();
	});
	it('should enforce a shared upload quota across STR and SIP', async () => {
		await upload('STR').expect(201);
		await upload('SIP').expect(201);
		await upload('STR').expect(201);
		await upload('SIP').expect(429);
		expect(service.submit).toHaveBeenCalledTimes(3);
	});
	it('should return binary private attachments without a JSON envelope', async () => {
		const result = await api()
			.get(`/expert/me/credentials/${revisionId}/document`)
			.set('x-test-role', 'EXPERT')
			.expect(200);
		expect(result.headers['content-type']).toContain('application/pdf');
		expect(result.headers['cache-control']).toBe('no-store');
		expect(result.headers['content-disposition']).toContain('attachment');
		expect(result.body).toEqual(Buffer.from('%PDF-synthetic'));
	});
	it('should validate revision UUIDs before private file access', async () => {
		await api()
			.get('/expert/me/credentials/not-a-uuid/document')
			.set('x-test-role', 'EXPERT')
			.expect(400);
		expect(service.download).not.toHaveBeenCalled();
	});
	it.each(['USER', 'EXPERT'])(
		'should deny private review routes to %s',
		async (role) => {
			await api()
				.get('/admin/expert-credentials')
				.set('x-test-role', role)
				.expect(403);
		},
	);
	it('should paginate admin review queues and reject unbounded pagination', async () => {
		await api()
			.get('/admin/expert-credentials?skip=0&take=20')
			.set('x-test-role', 'ADMIN')
			.expect(200);
		await api()
			.get('/admin/expert-credentials?take=101')
			.set('x-test-role', 'ADMIN')
			.expect(400);
	});
	it('should approve through a validated exact-revision contract', async () => {
		await api()
			.post(`/admin/expert-credentials/${revisionId}/review`)
			.set('x-test-role', 'ADMIN')
			.send({
				decision: 'APPROVE',
				digest: 'a'.repeat(64),
				expectedVersion: 1,
				documentMatches: true,
				reason: 'Document matches.',
			})
			.expect(200);
		expect(service.review).toHaveBeenCalled();
	});
	it('should reject review metadata edits and invalid matching evidence', async () => {
		await api()
			.post(`/admin/expert-credentials/${revisionId}/review`)
			.set('x-test-role', 'ADMIN')
			.send({
				decision: 'APPROVE',
				digest: 'a'.repeat(64),
				expectedVersion: 1,
				documentMatches: 'true',
				reason: 'Document matches.',
				holderName: 'Edited',
			})
			.expect(400);
		expect(service.review).not.toHaveBeenCalled();
	});
	it('should expose separate suspend/reinstate endpoints with bounded reasons', async () => {
		for (const action of ['suspend', 'reinstate'])
			await api()
				.post(`/admin/expert-credentials/${revisionId}/${action}`)
				.set('x-test-role', 'ADMIN')
				.send({ expectedVersion: 1, reason: 'Reviewed.' })
				.expect(200);
		await api()
			.post(`/admin/expert-credentials/${revisionId}/suspend`)
			.set('x-test-role', 'ADMIN')
			.send({ expectedVersion: 1, reason: ' ' })
			.expect(400);
	});
	it('should document multipart, private binary and typed JSON schemas', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		expect(
			doc.paths['/expert/me/credentials/{type}'].post?.requestBody,
		).toHaveProperty('content.multipart/form-data');
		expect(
			doc.paths['/expert/me/credentials/{revisionId}/document'].get
				?.responses['200'],
		).toHaveProperty('content.application/pdf');
		expect(
			doc.paths['/admin/expert-credentials/{revisionId}/review'].post
				?.security,
		).toBeDefined();
		expect(doc.components?.schemas?.ReviewCredentialDto).toHaveProperty(
			'properties.documentMatches',
		);
		expect(doc.components?.schemas?.CredentialRevisionDto).toHaveProperty(
			'properties.reason.type',
			'string',
		);
	});
});
