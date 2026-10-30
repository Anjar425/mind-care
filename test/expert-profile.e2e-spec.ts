import {
	ExecutionContext,
	INestApplication,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { ExpertProfileController } from '../src/expert/expert-profile.controller';
import { ExpertProfileService } from '../src/expert/expert-profile.service';
import { ExpertProfileCompletenessService } from '../src/expert/expert-profile-completeness.service';
import { CredentialEligibilityService } from '../src/expert-credentials/credential-eligibility.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/auth/guards/verified-email.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '../src/common/guards/api-rate-limit.guard';
import { setupApplication } from '../src/common/config/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import {
	createExpertProfileMocks,
	validProfileSubmission,
} from './expert-profile-mocks';
import { ownerId } from './credential-mocks';
import type { ExpertProfileResDto } from '../src/expert/dto/res/expert-profile.res.dto';

describe('Owner expert profile HTTP (real services, synthetic persistence/auth)', () => {
	let app: INestApplication<Server>;
	let mocks: ReturnType<typeof createExpertProfileMocks>;
	let errors: jest.SpyInstance;
	beforeEach(async () => {
		mocks = createExpertProfileMocks();
		errors = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const module = await Test.createTestingModule({
			imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
			controllers: [ExpertProfileController],
			providers: [
				ExpertProfileService,
				ExpertProfileCompletenessService,
				CredentialEligibilityService,
				RolesGuard,
				VerifiedEmailGuard,
				runtimeConfigProvider,
				ResponseInterceptor,
				{ provide: PrismaService, useValue: mocks.prisma },
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
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});
	const api = () => request(app.getHttpServer());
	const put = (body: unknown) =>
		api()
			.put('/expert/me/profile')
			.set('x-test-role', 'EXPERT')
			.send(body as object);
	it('should require a valid session for private profile reads', async () => {
		await api().get('/expert/me/profile').expect(401);
		expect(mocks.prisma.expert.findUnique).not.toHaveBeenCalled();
	});
	it.each(['USER', 'ADMIN'])(
		'should deny read and write access to %s',
		async (role) => {
			await api()
				.get('/expert/me/profile')
				.set('x-test-role', role)
				.expect(403);
			await api()
				.put('/expert/me/profile')
				.set('x-test-role', role)
				.send(validProfileSubmission())
				.expect(403);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it('should return an explicit owned unsubmitted profile without inventing clinical hours', async () => {
		const response = await api()
			.get('/expert/me/profile')
			.set('x-test-role', 'EXPERT')
			.expect(200);
		const { data } = response.body as { data: ExpertProfileResDto };
		expect(data.profile?.clinicalHours).toBeNull();
		expect(data.profileComplete).toBe(false);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(data.profile).toEqual({
			education: null,
			publicationsNumber: null,
			patientsNumber: null,
			clinicalHours: null,
		});
		expect(data).not.toHaveProperty('credentialRevisions');
	});
	it('should save all metrics and the four exact weights without requiring preferences or group membership', async () => {
		const dto = validProfileSubmission();
		const response = await put(dto).expect(200);
		const body = response.body as {
			statusCode: number;
			message: string;
			data: ExpertProfileResDto;
		};
		expect(body.statusCode).toBe(200);
		expect(body.message).toBe('Success');
		expect(body.data.profile).toEqual(dto.profile);
		expect(body.data.weights).toEqual(dto.weights);
		expect(body.data.version).toBe(1);
		expect(body.data.profileComplete).toBe(true);
		expect(body.data.weightsComplete).toBe(true);
		expect(response.headers['cache-control']).toBe('no-store');
	});
	it('should accept repeated-patient service counts and integer clinical hours as supplied', async () => {
		const dto = validProfileSubmission();
		dto.profile.patientsNumber = 120;
		dto.profile.publicationsNumber = 5;
		dto.profile.clinicalHours = 1200;
		const response = await put(dto).expect(200);
		expect(
			(response.body as { data: ExpertProfileResDto }).data.profile,
		).toEqual(dto.profile);
	});
	it('should reject partial nested submissions rather than partially persisting values', async () => {
		await put({
			expectedVersion: 0,
			profile: { clinicalHours: 1 },
			weights: { educationWeight: 100 },
		}).expect(400);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should reject unsupported fields at every nesting level', async () => {
		const dto = validProfileSubmission();
		for (const input of [
			{ ...dto, expertId: 'other' },
			{ ...dto, profile: { ...dto.profile, unsupportedMetric: 3 } },
			{ ...dto, weights: { ...dto.weights, extraFactor: 25 } },
			{ ...dto, role: 'ADMIN' },
		])
			await put(input).expect(400);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it.each([99, 101])(
		'should reject a weight total of %s with an actionable error and no correction',
		async (total) => {
			const dto = validProfileSubmission();
			dto.weights.clinicalHoursWeight = total - 75;
			const response = await put(dto).expect(400);
			expect((response.body as { message: string[] }).message).toContain(
				'weights must total exactly 100; values were not adjusted',
			);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it.each([-1, 1.5, '1', null, 2147483648])(
		'should reject unsupported clinicalHours %p',
		async (clinicalHours) => {
			const dto = validProfileSubmission();
			await put({
				...dto,
				profile: { ...dto.profile, clinicalHours },
			}).expect(400);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it('should reject zero education rather than treating it as a missing numerical score', async () => {
		const dto = validProfileSubmission();
		await put({ ...dto, profile: { ...dto.profile, education: 0 } }).expect(
			400,
		);
	});
	it('should deny an unverified owner before opening a write transaction', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({
			role: 'EXPERT',
			email_verified_at: null,
		});
		await put(validProfileSubmission()).expect(403);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it.each(['STR', 'SIP'] as const)(
		'should deny %s expiry on writes while preserving owner reads',
		async (type) => {
			mocks.expert.credentialRevisions.find(
				(row) => row.type === type,
			)!.expiresAt = new Date('2020-01-01');
			await put(validProfileSubmission()).expect(403);
			await api()
				.get('/expert/me/profile')
				.set('x-test-role', 'EXPERT')
				.expect(200);
			expect(mocks.prisma.weight.upsert).not.toHaveBeenCalled();
		},
	);
	it('should deny suspended experts without deleting their submitted values', async () => {
		mocks.expert.credentialSuspendedAt = new Date();
		await put(validProfileSubmission()).expect(403);
		expect(mocks.expert.profileVersion).toBe(0);
	});
	it('should return 409 for a stale version and preserve the latest successful profile', async () => {
		const dto = validProfileSubmission();
		await put(dto).expect(200);
		await put(dto).expect(409);
		expect(mocks.expert.profileVersion).toBe(1);
	});
	it('should return safe errors and roll back the simulated profile when weight persistence fails', async () => {
		mocks.prisma.weight.upsert.mockRejectedValue(
			new Error('PRIVATE_DB_CREDENTIAL_DETAIL'),
		);
		const response = await put(validProfileSubmission()).expect(503);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DB');
		expect(JSON.stringify(errors.mock.calls)).not.toContain('PRIVATE_DB');
		expect(mocks.expert.profileVersion).toBe(0);
		expect(mocks.expert.clinicalHours).toBeNull();
	});
	it('should keep all generic scaffold/public/admin profile routes unavailable', async () => {
		for (const route of [
			'/expert',
			'/expert/1',
			'/admin/expert-profiles',
			'/expert/me/profile/other',
		])
			await api().get(route).set('x-test-role', 'EXPERT').expect(404);
	});
	it('should apply the existing general quota to profile reads', async () => {
		for (let i = 0; i < 120; i++)
			await api()
				.get('/expert/me/profile')
				.set('x-test-role', 'EXPERT')
				.expect(200);
		await api()
			.get('/expert/me/profile')
			.set('x-test-role', 'EXPERT')
			.expect(429);
	});
	it('should document exactly four factor fields and the binary-independent JSON envelope', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		const factor = doc.components?.schemas?.ExpertFactorWeightsDto as {
			properties: Record<string, unknown>;
		};
		expect(Object.keys(factor.properties)).toEqual([
			'educationWeight',
			'publicationWeight',
			'patientWeight',
			'clinicalHoursWeight',
		]);
		expect(doc.paths['/expert/me/profile'].put?.responses).toHaveProperty(
			'409',
		);
		expect(doc.paths['/expert/me/profile'].put?.security).toBeDefined();
		expect(doc.paths).not.toHaveProperty('/expert');
		expect(doc.components?.schemas?.ExpertCapabilityResDto).toHaveProperty(
			'properties.clinicalHours.type',
			'number',
		);
		expect(doc.components?.schemas?.ExpertProfileResDto).toHaveProperty(
			'properties.validatedAt.format',
			'date-time',
		);
	});
});
