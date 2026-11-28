// Compiles and initialises the real AppModule graph (every module, controller, guard and
// provider) with only the database and SMTP transport replaced. Catches dependency-injection
// wiring mistakes that feature tests, which assemble their own providers, cannot see.
import type { INestApplication, Type } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import './app-composition.env';
import { AppModule } from '../src/app.module';
import { AuthSessionService } from '../src/domain/identity/auth-session.service';
import { hashToken } from '../src/domain/identity/token.util';
import type { RuntimeEnvironment } from '../src/infrastructure/config/environment.config';
import { MAIL_TRANSPORT } from '../src/infrastructure/mail/mail-transport';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { UserRole } from '../src/shared/types/role';

interface JwtClaims {
	type: string;
	sub: string;
	sid: string;
	jti: string;
	iat: number;
	exp: number;
}

describe('AppModule composition', () => {
	let app: INestApplication;
	// Only what the session wiring test touches; the rest of the graph never reaches the database.
	const prisma = {
		$connect: jest.fn(),
		$disconnect: jest.fn(),
		$queryRaw: jest.fn(),
		$transaction: jest.fn(),
		user: { findUnique: jest.fn() },
		refreshToken: {
			create: jest.fn(),
			findFirst: jest.fn(),
			updateMany: jest.fn(),
		},
	};

	beforeAll(async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(PrismaService)
			.useValue(prisma)
			.overrideProvider(MAIL_TRANSPORT)
			.useValue({ sendMail: jest.fn(), close: jest.fn() })
			.compile();
		app = module.createNestApplication({ logger: false });
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
	});

	function routes(): string[] {
		const discovery = app.get(DiscoveryService);
		const scanner = app.get(MetadataScanner);
		const found: string[] = [];
		for (const wrapper of discovery.getControllers()) {
			const type = wrapper.metatype as Type | undefined;
			if (!type) continue;
			const base = String(Reflect.getMetadata(PATH_METADATA, type) ?? '');
			const proto = type.prototype as Record<string, unknown>;
			for (const name of scanner.getAllMethodNames(proto)) {
				const handler = proto[name] as object;
				const path = Reflect.getMetadata(PATH_METADATA, handler) as
					string | undefined;
				if (path === undefined) continue;
				const method =
					RequestMethod[
						Reflect.getMetadata(METHOD_METADATA, handler) as number
					];
				const full = `/${[base, path].filter(Boolean).join('/')}`
					.replace(/\/+/g, '/')
					.replace(/(.)\/$/, '$1');
				found.push(`${method} ${full}`);
			}
		}
		return found;
	}

	it('resolves every provider, controller and guard of the real module graph', () => {
		expect(app).toBeDefined();
	});

	it('registers all 96 operations exactly once', () => {
		const all = routes();
		expect(all).toHaveLength(96);
		expect(new Set(all).size).toBe(all.length);
	});

	it('schedules the credential maintenance job exactly once', () => {
		expect([...app.get(SchedulerRegistry).getCronJobs().keys()]).toEqual([
			'credential-maintenance',
		]);
	});

	// BE-001: feature tests build JwtService without module options, so only the real
	// IdentityModule wiring shows whether its defaults break signing (they did: every login
	// and refresh returned 500).
	it('issues and rotates session tokens with the JwtService of the real IdentityModule', async () => {
		const sessions = app.get(AuthSessionService);
		const config = app.get(ConfigService<RuntimeEnvironment, true>);
		const [access] = config.get('JWT_ACCESS_KEYS', { infer: true });
		const [refresh] = config.get('JWT_REFRESH_KEYS', { infer: true });
		const jwt = new JwtService();
		const user = {
			id: 'wiring-user',
			name: 'Wiring',
			email: 'wiring@example.test',
			role: UserRole.USER,
		};
		prisma.$transaction.mockImplementation(
			(work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
		);
		prisma.user.findUnique.mockResolvedValue({ ...user, password: 'hash' });
		prisma.refreshToken.create.mockResolvedValue({});

		const login = await sessions.create(user.id, 'hash', UserRole.USER);

		const stored = (
			prisma.refreshToken.create.mock.calls[0] as [
				{ data: { id: string; expiresAt: Date } },
			]
		)[0].data;
		const sessionExp = Math.floor(stored.expiresAt.getTime() / 1000);
		const accessClaims = jwt.verify<JwtClaims>(login.accessToken, {
			secret: access.secret,
		});
		expect(accessClaims).toMatchObject({ type: 'access', sub: user.id });
		expect(accessClaims.exp - accessClaims.iat).toBe(
			config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
		);
		expect(jwt.decode(login.accessToken, { complete: true })).toMatchObject(
			{ header: { kid: access.kid } },
		);
		const refreshClaims = jwt.verify<JwtClaims>(login.refreshToken, {
			secret: refresh.secret,
		});
		expect(refreshClaims).toMatchObject({
			type: 'refresh',
			sid: stored.id,
			exp: sessionExp,
		});

		prisma.refreshToken.findFirst.mockResolvedValue({
			id: stored.id,
			userId: user.id,
			token: hashToken(login.refreshToken),
			expiresAt: stored.expiresAt,
			user: { ...user, emailVerifiedAt: new Date() },
		});
		prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

		const rotated = await sessions.rotate({
			sub: user.id,
			sid: stored.id,
			jti: refreshClaims.jti,
			role: user.role,
			email: user.email,
			type: 'refresh',
			tokenHash: hashToken(login.refreshToken),
		});

		expect(
			jwt.verify<JwtClaims>(rotated.refreshToken, {
				secret: refresh.secret,
			}),
		).toMatchObject({ type: 'refresh', sid: stored.id, exp: sessionExp });
		expect(rotated.refreshToken).not.toBe(login.refreshToken);
	});
});
