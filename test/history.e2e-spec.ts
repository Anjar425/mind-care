import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AuthSessionService } from '../src/auth/auth-session.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { setupApplication } from '../src/common/config/app.setup';
import { HistoryController } from '../src/history/history.controller';
import { HistoryService } from '../src/history/history.service';
import { HistoryVaultService } from '../src/history/history-vault.service';
import { HistoryExceptionFilter } from '../src/history/history-exception.filter';
import {
	historyEntryId,
	historyEntryInput,
	historyInit,
	historyMocks,
	historyOther,
	historyOwner,
} from './history-mocks';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';

describe('Private history HTTP: actual JWT session guard and services, synthetic persistence', () => {
	let app: INestApplication<Server>;
	let f: ReturnType<typeof historyMocks>;
	let jwt: JwtService;
	beforeEach(async () => {
		f = historyMocks();
		const module = await Test.createTestingModule({
			imports: [
				PassportModule,
				JwtModule.register({
					secret: syntheticConfig.JWT_ACCESS_SECRET,
				}),
			],
			controllers: [HistoryController],
			providers: [
				HistoryService,
				HistoryVaultService,
				HistoryExceptionFilter,
				AuthSessionService,
				JwtStrategy,
				JwtAuthGuard,
				RolesGuard,
				runtimeConfigProvider,
				ResponseInterceptor,
				{ provide: PrismaService, useValue: f.prisma },
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
		await app.close();
		jest.restoreAllMocks();
	});
	const api = () => request(app.getHttpServer());
	const token = (userId = historyOwner, role = f.users.get(userId)!) => {
		const sid = 'synthetic-session-' + userId;
		f.sessions.set(sid, {
			userId,
			expiresAt: new Date(Date.now() + 60000),
		});
		return jwt.sign(
			{ sub: userId, sid, jti: 'synthetic-jti', role, type: 'access' },
			{ expiresIn: '15m' },
		);
	};
	const put = (path: string, body: unknown, bearer = token()) =>
		api()
			.put('/me/history' + path)
			.auth(bearer, { type: 'bearer' })
			.send(body as object);
	it('should reject guests and revoked sessions before private writes', async () => {
		const guest = await api().get('/me/history/vault').expect(401);
		expect(guest.headers['cache-control']).toBe('no-store');
		const bearer = token();
		f.sessions.clear();
		await api()
			.get('/me/history/vault')
			.auth(bearer, { type: 'bearer' })
			.expect(401);
		expect(f.prisma.historyVault.create).not.toHaveBeenCalled();
	});
	it('should deny administrators even for owner routes', async () => {
		f.users.set(historyOwner, 'ADMIN');
		await api()
			.get('/me/history/vault')
			.auth(token(), { type: 'bearer' })
			.expect(403);
		expect(f.prisma.historyVault.findUnique).not.toHaveBeenCalled();
	});
	it('should initialize opt-out and require explicit boolean storage consent', async () => {
		const bearer = token();
		const initialized = await api()
			.post('/me/history/vault')
			.auth(bearer, { type: 'bearer' })
			.send(historyInit())
			.expect(201);
		expect(
			(initialized.body as { data: { storageConsent: boolean } }).data
				.storageConsent,
		).toBe(false);
		await put(
			'/entries/' + historyEntryId,
			historyEntryInput(0),
			bearer,
		).expect(409);
		await put(
			'/consent',
			{ expectedVaultRevision: 0, enabled: 'true' },
			bearer,
		).expect(400);
		await put(
			'/consent',
			{ expectedVaultRevision: 0, enabled: true },
			bearer,
		).expect(200);
		const saved = await put(
			'/entries/' + historyEntryId,
			historyEntryInput(),
			bearer,
		).expect(201);
		expect(
			(saved.body as { data: { vaultRevision: number } }).data
				.vaultRevision,
		).toBe(2);
		await put(
			'/entries/' + historyEntryId,
			historyEntryInput(),
			bearer,
		).expect(200);
	});
	it('should redact unknown submitted field names and plaintext values', async () => {
		await f.ready();
		const response = await put('/entries/' + historyEntryId, {
			...historyEntryInput(),
			'sensitive invented field': 'private answer',
		}).expect(400);
		expect(JSON.stringify(response.body)).not.toContain('sensitive');
		expect(JSON.stringify(response.body)).not.toContain('private answer');
		expect(f.entries.size).toBe(0);
	});
	it('should not reveal another owner entry through ID or cursor', async () => {
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		await api()
			.get('/me/history/entries/' + historyEntryId)
			.auth(token(historyOther), { type: 'bearer' })
			.expect(404);
		await api()
			.delete('/me/history/entries/' + historyEntryId)
			.auth(token(historyOther), { type: 'bearer' })
			.send({ expectedVaultRevision: 2 })
			.expect(404);
		expect(f.entries.size).toBe(1);
	});
	it('should delete every own entry without resetting vault, consent or recovery', async () => {
		await f.ready();
		await f.service.save(historyOwner, historyEntryId, historyEntryInput());
		const before = f.vaults.get(historyOwner)!;
		await api()
			.delete('/me/history/entries')
			.auth(token(), { type: 'bearer' })
			.send({ expectedVaultRevision: 2 })
			.expect(200);
		expect(f.entries.size).toBe(0);
		expect(f.vaults.get(historyOwner)).toEqual({ ...before, revision: 3 });
		await put('/entries/' + historyEntryId, historyEntryInput()).expect(
			409,
		);
	});
	it('should refuse oversized and malformed JSON before validation without leaking input', async () => {
		const oversized = await put('/entries/' + historyEntryId, {
			ciphertext: 'private'.repeat(10000),
		}).expect(413);
		expect(oversized.headers['cache-control']).toBe('no-store');
		expect(JSON.stringify(oversized.body)).not.toContain('privateprivate');
		const malformed = await api()
			.put('/me/history/consent')
			.auth(token(), { type: 'bearer' })
			.set('Content-Type', 'application/json')
			.send('{"private answer":')
			.expect(400);
		expect(malformed.headers['cache-control']).toBe('no-store');
		expect(JSON.stringify(malformed.body)).not.toContain('private answer');
	});
	it('should emit only generic failure logs for unknown persistence errors', async () => {
		const log = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		f.prisma.$transaction.mockRejectedValueOnce(
			new Error('private result in database error'),
		);
		const response = await api()
			.get('/me/history/vault')
			.auth(token(), { type: 'bearer' })
			.expect(503);
		expect(JSON.stringify(response.body)).not.toContain('private result');
		expect(log).toHaveBeenCalledWith('API request failed');
	});
	it('should publish typed private routes and omit admin/decrypt endpoints', () => {
		const doc = SwaggerModule.createDocument(
			app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		const save = doc.paths['/me/history/entries/{id}'].put!;
		expect(save.security).toEqual([{ bearer: [] }]);
		expect(save.responses).toHaveProperty('201');
		expect(save.responses).toHaveProperty('200');
		expect(Object.keys(doc.paths)).not.toEqual(
			expect.arrayContaining(['/admin/history', '/me/history/decrypt']),
		);
		expect(doc.components?.schemas).toHaveProperty(
			'HistoryEntrySubmissionDto',
		);
	});
	it('should retain own history access for expert accounts without professional eligibility', async () => {
		f.users.set(historyOwner, 'EXPERT');
		await f.ready();
		await api()
			.get('/me/history/vault')
			.auth(token(), { type: 'bearer' })
			.expect(200);
	});
});
