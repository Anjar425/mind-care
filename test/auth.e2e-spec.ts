import { runtimeConfigProvider } from './runtime-config.mock';
import {
	Controller,
	Get,
	INestApplication,
	Logger,
	Req,
	UseFilters,
	UseGuards,
	ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { Server } from 'node:http';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { AuthSessionService } from '@/auth/auth-session.service';
import { AuthExceptionFilter } from '@/auth/auth-exception.filter';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { RefreshStrategy } from '@/auth/strategies/refresh.strategy';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RefreshAuthGuard } from '@/auth/guards/refresh-auth.guard';
import type { AccessPrincipal, SessionTokens } from '@/auth/session.types';
import { UserService } from '@/user/user.service';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/mail/mail.service';
import { UserRole } from '@/common/constant/role.constant';
import { ResponseInterceptor } from '@/common/interceptor/response/response.interceptor';
import { createAuthMemoryStore } from './auth-memory-store';

@Controller('auth-test')
@UseFilters(AuthExceptionFilter)
class ProtectedTestController {
	@Get('me')
	@UseGuards(JwtAuthGuard)
	me(@Req() req: { user: AccessPrincipal }) {
		return req.user;
	}
}

describe('Authentication HTTP (isolated DB/mail adapters)', () => {
	let app: INestApplication<Server>;
	let logError: jest.SpyInstance;
	let module: TestingModule;
	let store: ReturnType<typeof createAuthMemoryStore>;
	let jwt: JwtService;
	let mail: jest.Mocked<
		Pick<MailService, 'sendVerificationEmail' | 'sendPasswordResetEmail'>
	>;
	const password = 'Passw0rd123';
	const passwordHash = bcrypt.hashSync(password, 4);

	beforeEach(async () => {
		store = createAuthMemoryStore(passwordHash);
		mail = {
			sendVerificationEmail: jest.fn(),
			sendPasswordResetEmail: jest.fn(),
		};
		logError = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		module = await Test.createTestingModule({
			imports: [
				PassportModule.register({ defaultStrategy: 'jwt' }),
				JwtModule.register({}),
			],
			controllers: [AuthController, ProtectedTestController],
			providers: [
				runtimeConfigProvider,
				AuthService,
				AuthSessionService,
				AuthExceptionFilter,
				UserService,
				JwtStrategy,
				RefreshStrategy,
				JwtAuthGuard,
				RefreshAuthGuard,
				ResponseInterceptor,
				{ provide: PrismaService, useValue: store.prisma },
				{ provide: MailService, useValue: mail },
			],
		}).compile();
		jwt = module.get(JwtService);
		app = module.createNestApplication<INestApplication<Server>>({
			logger: false,
		});
		app.useGlobalPipes(
			new ValidationPipe({
				transform: true,
				whitelist: true,
				forbidNonWhitelisted: true,
			}),
		);
		app.useGlobalInterceptors(module.get(ResponseInterceptor));
		await app.init();
		await app.listen(0, '127.0.0.1');
	});
	afterEach(async () => {
		await app.close();
		jest.clearAllMocks();
		jest.restoreAllMocks();
	});

	async function login(role = UserRole.USER): Promise<SessionTokens> {
		const path =
			role === UserRole.USER
				? '/auth/login'
				: `/auth/${role.toLowerCase()}/login`;
		const response = await request(app.getHttpServer())
			.post(path)
			.send({ email: ` ${role}@Example.com `, password })
			.expect(200);
		expect(response.body).toHaveProperty('message', 'Login successful');
		expect(typeof (response.body as { message: unknown }).message).toBe(
			'string',
		);
		return (response.body as { data: SessionTokens }).data;
	}
	const bearer = (token: string) => `Bearer ${token}`;

	it.each([UserRole.USER, UserRole.EXPERT, UserRole.ADMIN])(
		'should issue role-bound sessions when the matching login endpoint is used (%p)',
		async (role) => {
			const result = await login(role);
			expect(result.user.role).toBe(role);
			expect(result.user).not.toHaveProperty('password');
			expect(result.refreshToken).not.toBe(result.accessToken);
			expect(store.sessions.size).toBe(1);
			expect([...store.sessions.values()][0].token).not.toBe(
				result.refreshToken,
			);
		},
	);

	it.each([
		['/auth/login', 'expert@example.com'],
		['/auth/login', 'admin@example.com'],
		['/auth/expert/login', 'user@example.com'],
		['/auth/expert/login', 'admin@example.com'],
		['/auth/admin/login', 'user@example.com'],
		['/auth/admin/login', 'expert@example.com'],
	])(
		'should deny cross-role sign-in when %s receives %s',
		async (path, email) => {
			await request(app.getHttpServer())
				.post(path)
				.send({ email, password })
				.expect(401);
			expect(store.sessions.size).toBe(0);
		},
	);

	it('should create a normalized account when public registration is valid', async () => {
		const response = await request(app.getHttpServer())
			.post('/auth/user/register')
			.send({
				name: 'New Example',
				email: ' NEW@Example.com ',
				password,
				confirm_password: password,
			})
			.expect(201);
		const body = response.body as {
			data: { user: Record<string, unknown> };
		};
		expect(body.data.user.email).toBe('new@example.com');
		expect(body.data.user.role).toBe('USER');
		expect(body.data.user).not.toHaveProperty('password');
	});

	it('should create only an expert account when expert registration is valid', async () => {
		const response = await request(app.getHttpServer())
			.post('/auth/expert/register')
			.send({
				name: 'New Expert',
				email: 'newexpert@example.com',
				password,
				confirm_password: password,
			})
			.expect(201);
		expect(
			(response.body as { data: { user: { role: string } } }).data.user
				.role,
		).toBe('EXPERT');
	});

	it('should reject privileged registration and unknown fields when input bypass is attempted', async () => {
		await request(app.getHttpServer())
			.post('/auth/user/register')
			.send({
				name: 'Example',
				email: 'new@example.com',
				password,
				confirm_password: password,
				role: 'ADMIN',
			})
			.expect(400);
		await request(app.getHttpServer())
			.post('/auth/admin/register')
			.send({})
			.expect(404);
	});

	it('should reject duplicate identity when email case differs', async () => {
		await request(app.getHttpServer())
			.post('/auth/user/register')
			.send({
				name: 'Example',
				email: ' USER@Example.com ',
				password,
				confirm_password: password,
			})
			.expect(409);
	});

	it('should keep another device active when one session logs out', async () => {
		const first = await login();
		const second = await login();
		await request(app.getHttpServer())
			.post('/auth/logout')
			.set('Authorization', bearer(first.accessToken))
			.expect(200);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(first.accessToken))
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(first.refreshToken))
			.expect(401);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(second.accessToken))
			.expect(200);
		expect(store.sessions.size).toBe(1);
	});

	it('should rotate tokens and revoke their family when a consumed token is replayed', async () => {
		const first = await login();
		const response = await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(first.refreshToken))
			.expect(200);
		const rotated = (response.body as { data: SessionTokens }).data;
		expect(rotated.refreshToken).not.toBe(first.refreshToken);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(rotated.accessToken))
			.expect(200);
		await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(first.refreshToken))
			.expect(401);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(rotated.accessToken))
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(rotated.refreshToken))
			.expect(401);
	});

	it('should allow at most one rotation when the same token is refreshed concurrently', async () => {
		const first = await login();
		const results = await Promise.all([
			request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Authorization', bearer(first.refreshToken)),
			request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Authorization', bearer(first.refreshToken)),
		]);
		expect(
			results.filter((result) => result.status === 200).length,
		).toBeLessThanOrEqual(1);
		expect(results.some((result) => result.status === 401)).toBe(true);
		expect(store.sessions.size).toBe(0);
	});

	it('should reject old tokens and wrong token types when claims do not match the endpoint', async () => {
		const first = await login();
		const oldAccess = jwt.sign(
			{ sub: 'USER', role: 'USER' },
			{ secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
		);
		const oldRefresh = jwt.sign(
			{ sub: 'USER', role: 'USER', type: 'refresh' },
			{ secret: process.env.JWT_REFRESH_SECRET, expiresIn: '7d' },
		);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(oldAccess))
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(oldRefresh))
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/refresh')
			.set('Authorization', bearer(first.accessToken))
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/logout')
			.set('Authorization', bearer(first.refreshToken))
			.expect(401);
	});

	it('should reject expired or forged credentials when authentication is attempted', async () => {
		const first = await login();
		const claims = jwt.decode<{
			sub: string;
			sid: string;
			jti: string;
			role: string;
			type: string;
		}>(first.accessToken);
		const expired = jwt.sign(
			{
				sub: claims.sub,
				sid: claims.sid,
				role: claims.role,
				jti: claims.jti,
				type: 'access',
			},
			{ secret: process.env.JWT_ACCESS_SECRET, expiresIn: -1 },
		);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer(expired))
			.expect(401);
		await request(app.getHttpServer())
			.get('/auth-test/me')
			.set('Authorization', bearer('invalid'))
			.expect(401);
	});

	it('should invalidate all previous access and refresh sessions when password reset succeeds', async () => {
		const first = await login();
		const second = await login();
		await request(app.getHttpServer())
			.post('/auth/forgot-password')
			.send({ email: ' USER@Example.com ' })
			.expect(200);
		const token = mail.sendPasswordResetEmail.mock.calls[0][1];
		const response = await request(app.getHttpServer())
			.post('/auth/reset-password')
			.send({ token, newPassword: 'DifferentPass123' })
			.expect(200);
		expect(
			(response.body as { data: Record<string, unknown> }).data,
		).not.toHaveProperty('password');
		expect(
			(response.body as { data: Record<string, unknown> }).data,
		).not.toHaveProperty('user');
		expect(JSON.stringify(response.body)).not.toContain(passwordHash);
		for (const session of [first, second]) {
			await request(app.getHttpServer())
				.get('/auth-test/me')
				.set('Authorization', bearer(session.accessToken))
				.expect(401);
			await request(app.getHttpServer())
				.post('/auth/refresh')
				.set('Authorization', bearer(session.refreshToken))
				.expect(401);
		}
		await request(app.getHttpServer())
			.post('/auth/reset-password')
			.send({ token, newPassword: 'DifferentPass123' })
			.expect(400);
		await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: 'user@example.com', password })
			.expect(401);
		await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: 'user@example.com', password: 'DifferentPass123' })
			.expect(200);
	});

	it('should reject reset and registration equally when the password violates the byte or strength policy', async () => {
		for (const invalid of ['Aa1' + 'é'.repeat(35), 'weak']) {
			await request(app.getHttpServer())
				.post('/auth/user/register')
				.send({
					name: 'Example',
					email: 'new@example.com',
					password: invalid,
					confirm_password: invalid,
				})
				.expect(400);
			await request(app.getHttpServer())
				.post('/auth/reset-password')
				.send({ token: 'a'.repeat(64), newPassword: invalid })
				.expect(400);
		}
		expect(store.resets.size).toBe(0);
	});

	it('should verify email once when a valid link token is consumed', async () => {
		await request(app.getHttpServer())
			.post('/auth/send-verification')
			.send({ email: ' USER@Example.com ' })
			.expect(200);
		const token = mail.sendVerificationEmail.mock.calls[0][1];
		await request(app.getHttpServer())
			.get('/auth/verify')
			.query({ token })
			.expect(200);
		expect(store.users.get('USER')?.email_verified_at).toBeInstanceOf(Date);
		await request(app.getHttpServer())
			.get('/auth/verify')
			.query({ token })
			.expect(400);
		await request(app.getHttpServer()).get('/auth/verify').expect(400);
	});

	it('should return generic recovery responses when account presence or SMTP availability differs', async () => {
		const unknown = await request(app.getHttpServer())
			.post('/auth/forgot-password')
			.send({ email: 'unknown@example.com' })
			.expect(200);
		mail.sendPasswordResetEmail.mockRejectedValue(
			new Error('PRIVATE_SMTP_TOKEN'),
		);
		const known = await request(app.getHttpServer())
			.post('/auth/forgot-password')
			.send({ email: 'user@example.com' })
			.expect(200);
		expect(known.body).toEqual(unknown.body);
		expect(JSON.stringify(logError.mock.calls)).not.toContain(
			'PRIVATE_SMTP_TOKEN',
		);
	});

	it('should redact backend errors when a protected login operation fails', async () => {
		store.prisma.user.findMany.mockRejectedValue(
			new Error('PRIVATE_DB_CONNECTION'),
		);
		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: 'user@example.com', password })
			.expect(500);
		expect(response.body).toEqual({
			statusCode: 500,
			message: ['Internal server error'],
			error: 'Internal Server Error',
		});
	});

	it('should document actual auth contracts when OpenAPI is generated', () => {
		const document = SwaggerModule.createDocument(
			app,
			new DocumentBuilder()
				.addBearerAuth(undefined, 'access-token')
				.addBearerAuth(undefined, 'refresh-token')
				.build(),
		);
		for (const path of [
			'/auth/login',
			'/auth/expert/login',
			'/auth/admin/login',
			'/auth/refresh',
			'/auth/logout',
			'/auth/reset-password',
		]) {
			expect(document.paths[path]?.post?.responses['200']).toBeDefined();
			expect(
				document.paths[path]?.post?.responses['201'],
			).toBeUndefined();
		}
		expect(
			document.paths['/auth/user/register']?.post?.responses['201'],
		).toBeDefined();
		expect(document.paths['/auth/refresh']?.post?.security).toEqual([
			{ 'refresh-token': [] },
		]);
		expect(document.components?.schemas?.AuthUserResDto).not.toHaveProperty(
			'properties.password',
		);
		expect(document.components?.schemas?.LoginResDto).toHaveProperty(
			'properties.user',
		);
		expect(document.components?.schemas?.LoginResDto).toHaveProperty(
			'properties.refreshToken',
		);
	});
});
