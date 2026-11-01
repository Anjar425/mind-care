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
import { ExpertPreferencesController } from '../src/expert-preferences/expert-preferences.controller';
import { ExpertPreferencesService } from '../src/expert-preferences/expert-preferences.service';
import { ExpertPreferencesCompletenessService } from '../src/expert-preferences/expert-preferences-completeness.service';
import { CredentialEligibilityService } from '../src/expert-credentials/credential-eligibility.service';
import { ReferenceDataService } from '../src/reference-data/reference-data.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/auth/guards/verified-email.guard';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '../src/common/guards/api-rate-limit.guard';
import { setupApplication } from '../src/common/config/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import {
	completePreferenceRows,
	createExpertPreferencesMocks,
	validPreferencesSubmission,
} from './expert-preferences-mocks';
import { expertId, ownerId } from './credential-mocks';
import type { PreferenceState } from '../src/expert-preferences/expert-preferences.types';

describe('Expert preference HTTP (real services; synthetic auth and persistence)', () => {
	let app: INestApplication<Server>;
	let mocks: ReturnType<typeof createExpertPreferencesMocks>;
	let errors: jest.SpyInstance;
	beforeEach(async () => {
		mocks = createExpertPreferencesMocks();
		errors = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const module = await Test.createTestingModule({
			imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
			controllers: [ExpertPreferencesController],
			providers: [
				ExpertPreferencesService,
				ExpertPreferencesCompletenessService,
				CredentialEligibilityService,
				ReferenceDataService,
				RolesGuard,
				VerifiedEmailGuard,
				runtimeConfigProvider,
				ResponseInterceptor,
				mocks.provider,
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
			.put('/expert/me/preferences')
			.set('x-test-role', 'EXPERT')
			.send(body as object);
	const get = () =>
		api().get('/expert/me/preferences').set('x-test-role', 'EXPERT');
	const data = (response: { body: unknown }) =>
		(response.body as { data: PreferenceState }).data;
	it('should require a valid session for both private endpoints', async () => {
		await api().get('/expert/me/preferences').expect(401);
		await api()
			.put('/expert/me/preferences')
			.send(validPreferencesSubmission())
			.expect(401);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it.each(['USER', 'ADMIN'])(
		'should deny other-role %s access without reading private preferences',
		async (role) => {
			await api()
				.get('/expert/me/preferences')
				.set('x-test-role', role)
				.expect(403);
			await api()
				.put('/expert/me/preferences')
				.set('x-test-role', role)
				.send(validPreferencesSubmission())
				.expect(403);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it('should return no-store unsubmitted state with a usable hash and no invented rows', async () => {
		const response = await get().expect(200);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(data(response).preferences).toEqual([]);
		expect(data(response).stateHash).toMatch(/^[a-f0-9]{64}$/);
		expect(data(response).preferencesComplete).toBe(false);
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should accept all 21 groups even when the Task 5 profile and factors have not been submitted', async () => {
		const current = data(await get().expect(200));
		const dto = validPreferencesSubmission(current.stateHash);
		const response = await put(dto).expect(200);
		const state = data(response);
		expect(state.preferencesComplete).toBe(true);
		expect(state.preferences).toHaveLength(21);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(state.preferences[0]).toEqual({
			...dto.preferences[0],
			catalogVersion: dto.catalogVersion,
		});
		expect(mocks.expert).not.toHaveProperty('education');
		expect(mocks.expert).not.toHaveProperty('weight');
		expect(mocks.tx.preferences.upsert).toHaveBeenCalledTimes(21);
	});
	it('should accept individual zero/100 components while enforcing each independent total', async () => {
		const dto = validPreferencesSubmission();
		dto.preferences = dto.preferences.map((row) => ({
			...row,
			percentDepression: 100,
			percentAnxiety: 0,
			percentStress: 0,
		}));
		expect(data(await put(dto).expect(200)).preferencesComplete).toBe(true);
	});
	it('should preserve keyed input values while returning catalog question order', async () => {
		const dto = validPreferencesSubmission();
		dto.preferences[0].percentDepression = 41;
		dto.preferences[0].percentStress = 24;
		dto.preferences.reverse();
		const state = data(await put(dto).expect(200));
		expect(state.preferences[0].dass21Id).toBe('DASS21-Q01');
		expect(state.preferences[0].percentDepression).toBe(41);
		expect(state.preferences[0].percentStress).toBe(24);
	});
	it.each([0, 20, 22])(
		'should reject an incomplete or excessive group count %s before writing',
		async (count) => {
			const dto = validPreferencesSubmission();
			await put({
				...dto,
				preferences: Array.from(
					{ length: count },
					(_, i) => dto.preferences[i % 21],
				),
			}).expect(400);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it('should reject a duplicate ID even when 21 groups are present', async () => {
		const dto = validPreferencesSubmission();
		dto.preferences[20] = { ...dto.preferences[0] };
		const response = await put(dto).expect(400);
		expect((response.body as { message: string[] }).message).toContain(
			'DASS21-Q01 is duplicated',
		);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it.each(['UNKNOWN', 'DASS42-Q01', 'DASS21-Q22'])(
		'should reject unrecognized question %s',
		async (dass21Id) => {
			const dto = validPreferencesSubmission();
			dto.preferences[0].dass21Id = dass21Id;
			await put(dto).expect(400);
			expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
		},
	);
	it.each([-1, 101, 0.5, '40', null, true])(
		'should reject non-integer or out-of-range preference %p',
		async (percentDepression) => {
			const dto = validPreferencesSubmission();
			await put({
				...dto,
				preferences: dto.preferences.map((row, i) =>
					i === 0 ? { ...row, percentDepression } : row,
				),
			}).expect(400);
			expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		},
	);
	it.each([99, 101])(
		'should reject a row total of %s with an actionable question-specific message',
		async (total) => {
			const dto = validPreferencesSubmission();
			dto.preferences[0].percentStress = total - 75;
			const response = await put(dto).expect(400);
			expect((response.body as { message: string[] }).message).toContain(
				'DASS21-Q01 D/A/S percentages must total exactly 100; values were not adjusted',
			);
			expect(mocks.state.rows).toEqual([]);
		},
	);
	it('should reject missing nested values and owner/admin injection at every level', async () => {
		const dto = validPreferencesSubmission();
		for (const body of [
			{ ...dto, userId: 'another' },
			{ ...dto, groupId: 1 },
			{
				...dto,
				preferences: dto.preferences.map((row, i) =>
					i === 0 ? { ...row, expertId: 'another' } : row,
				),
			},
			{
				...dto,
				preferences: dto.preferences.map((row, i) =>
					i === 0
						? {
								dass21Id: row.dass21Id,
								percentDepression: 40,
								percentAnxiety: 35,
							}
						: row,
				),
			},
		])
			await put(body).expect(400);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should reject invalid or absent comparison metadata', async () => {
		const dto = validPreferencesSubmission();
		for (const body of [
			{ ...dto, expectedStateHash: 'bad' },
			{ ...dto, expectedStateHash: undefined },
			{ ...dto, catalogVersion: null },
		])
			await put(body).expect(400);
	});
	it('should return 409 on stale form state without changing stored input', async () => {
		const dto = validPreferencesSubmission();
		await put(dto).expect(200);
		await put(dto).expect(409);
		expect(mocks.state.rows).toHaveLength(21);
		expect(mocks.tx.preferences.upsert).toHaveBeenCalledTimes(21);
	});
	it('should allow a fresh full resubmission without changing preference row identities', async () => {
		await put(validPreferencesSubmission()).expect(200);
		const current = data(await get().expect(200));
		const dto = validPreferencesSubmission(current.stateHash);
		dto.preferences[0].percentAnxiety = 36;
		dto.preferences[0].percentStress = 24;
		await put(dto).expect(200);
		expect(mocks.state.rows[0].id).toBe(1);
		expect(mocks.state.rows).toHaveLength(21);
	});
	it('should return 409 for an outdated reviewed reference version', async () => {
		await put({
			...validPreferencesSubmission(),
			catalogVersion: 'previous-release',
		}).expect(409);
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should deny unverified owners before starting the mutation transaction', async () => {
		mocks.expert.user.email_verified_at = null as unknown as Date;
		await put(validPreferencesSubmission()).expect(403);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it.each(['STR', 'SIP'] as const)(
		'should deny expired %s writes while allowing private reads',
		async (type) => {
			mocks.expert.credentialRevisions.find(
				(row) => row.type === type,
			)!.expiresAt = new Date('2020-01-01');
			await put(validPreferencesSubmission()).expect(403);
			await get().expect(200);
			expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
		},
	);
	it('should deny suspension and mismatching document identity without adding default vectors', async () => {
		mocks.expert.credentialSuspendedAt = new Date();
		await put(validPreferencesSubmission()).expect(403);
		mocks.expert.credentialSuspendedAt = null;
		mocks.expert.user.name = 'Changed';
		await put(validPreferencesSubmission()).expect(403);
		expect(mocks.state.rows).toEqual([]);
	});
	it('should isolate owned reads from another expert set', async () => {
		mocks.state.rows = completePreferenceRows().map((row, i) => ({
			...row,
			id: i + 1,
			expertId: 'other',
		}));
		expect(data(await get().expect(200)).preferences).toEqual([]);
	});
	it('should expose partial existing state as incomplete without filling missing values', async () => {
		mocks.state.rows = completePreferenceRows()
			.slice(0, 2)
			.map((row, i) => ({ ...row, id: i + 1, expertId }));
		const state = data(await get().expect(200));
		expect(state.preferencesComplete).toBe(false);
		expect(state.preferences).toHaveLength(2);
	});
	it('should mark differently authored preferences incomplete and preserve their release labels', async () => {
		mocks.state.rows = completePreferenceRows('previous-release').map(
			(row, i) => ({ ...row, id: i + 1, expertId }),
		);
		const state = data(await get().expect(200));
		expect(state.preferencesComplete).toBe(false);
		expect(state.preferences[0].catalogVersion).toBe('previous-release');
	});
	it('should return safe 503 when the reference catalog is unavailable', async () => {
		mocks.tx.dASS21.findMany.mockResolvedValue([]);
		const response = await get().expect(503);
		expect(data(response)).toBeUndefined();
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should roll back simulated intermediate writes and hide persistence details', async () => {
		const original = mocks.tx.preferences.upsert.getMockImplementation()!;
		let count = 0;
		mocks.tx.preferences.upsert.mockImplementation((args) =>
			++count === 5
				? Promise.reject(new Error('PRIVATE_DB_USER_OR_VECTOR'))
				: original(args),
		);
		const response = await put(validPreferencesSubmission()).expect(503);
		expect(mocks.state.rows).toEqual([]);
		expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DB');
		expect(JSON.stringify(errors.mock.calls)).not.toContain('PRIVATE_DB');
	});
	it('should keep public bulk, arbitrary-owner, partial-write and admin-edit routes unavailable', async () => {
		for (const route of [
			'/expert/preference/get-all',
			'/expert/me/preferences/other',
			'/admin/expert-preferences',
		])
			await api().get(route).set('x-test-role', 'EXPERT').expect(404);
		await api()
			.patch('/expert/me/preferences')
			.set('x-test-role', 'EXPERT')
			.send({})
			.expect(404);
	});
	it('should apply the existing general local quota to preference reads', async () => {
		for (let i = 0; i < 120; i++) await get().expect(200);
		await get().expect(429);
	});
	it('should document exact array bounds, integer fields, hashes and private auth', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		expect(
			doc.components?.schemas?.ReplaceExpertPreferencesDto,
		).toHaveProperty('properties.preferences.minItems', 21);
		expect(
			doc.components?.schemas?.ReplaceExpertPreferencesDto,
		).toHaveProperty('properties.preferences.maxItems', 21);
		expect(doc.components?.schemas?.ExpertPreferenceItemDto).toHaveProperty(
			'properties.percentDepression.type',
			'integer',
		);
		expect(doc.components?.schemas?.ExpertPreferencesResDto).toHaveProperty(
			'properties.stateHash.type',
			'string',
		);
		expect(doc.paths['/expert/me/preferences'].put?.security).toBeDefined();
		expect(
			doc.paths['/expert/me/preferences'].put?.responses,
		).toHaveProperty('409');
		expect(doc.paths).not.toHaveProperty('/expert/preference/get-all');
	});
});
