import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from '../../src/domain/identity/auth-session.service';
import { AuthService } from '../../src/domain/identity/auth.service';
import { UserService } from '../../src/domain/identity/user.service';
import { SecurityEventService } from '../../src/domain/security-events/security-event.service';
import type { MailService } from '../../src/infrastructure/mail/mail.service';
import { requestContext } from '../../src/infrastructure/observability/request-context';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { UserRole } from '../../src/shared/types/role';
import {
	PASSWORD,
	createPrisma,
	createUser,
	dbConfig,
	resetData,
} from './support';

describe('Security events on PostgreSQL', () => {
	const config = dbConfig();
	const jwt = new JwtService({});
	let prisma: PrismaService;
	let events: SecurityEventService;
	let sessions: AuthSessionService;
	let auth: AuthService;
	const mail = {
		sendVerificationEmail: jest.fn(),
		sendPasswordResetEmail: jest.fn(),
	};
	const inRequest = <T>(work: () => Promise<T>) =>
		requestContext.run(
			{
				requestId: 'req-test',
				ip: '198.51.100.20',
				userAgent: 'curl/8.5',
			},
			work,
		);
	const stored = () =>
		prisma.securityEvent.findMany({ orderBy: { createdAt: 'asc' } });

	beforeAll(() => {
		prisma = createPrisma();
		events = new SecurityEventService(prisma, config);
		sessions = new AuthSessionService(prisma, jwt, config, events);
		auth = new AuthService(
			prisma,
			new UserService(prisma),
			sessions,
			mail as unknown as MailService,
			config,
			events,
		);
	});
	beforeEach(() => resetData(prisma));
	afterAll(() => prisma.$disconnect());

	it('3B-4: records failed and successful sign-ins with request facts and no personal data', async () => {
		const user = await createUser(prisma);
		await expect(
			inRequest(() =>
				auth.login(
					{ email: user.email, password: 'Wrong-pass1' },
					UserRole.USER,
				),
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
		await expect(
			inRequest(() =>
				auth.login(
					{ email: 'nobody@example.test', password: PASSWORD },
					UserRole.USER,
				),
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
		await inRequest(() =>
			auth.login(
				{ email: user.email, password: PASSWORD },
				UserRole.USER,
			),
		);

		const rows = await stored();
		expect(rows.map((r) => [r.type, r.subjectUserId])).toEqual([
			['LOGIN_FAILED', user.id],
			['LOGIN_FAILED', null],
			['LOGIN_SUCCEEDED', user.id],
		]);
		for (const row of rows) {
			expect(row.requestId).toBe('req-test');
			expect(row.userAgentFamily).toBe('cli');
			expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
		}
		expect(JSON.stringify(rows)).not.toMatch(
			/198\.51\.100\.20|nobody@example|@example\.test/,
		);
	});

	it('3B-4: records refresh-token reuse', async () => {
		const user = await createUser(prisma);
		const tokens = await sessions.create(
			user.id,
			user.password,
			UserRole.USER,
		);
		const payload = jwt.verify<Record<string, unknown>>(
			tokens.refreshToken,
			{
				secret: config.get('JWT_REFRESH_SECRET', { infer: true }),
			},
		);
		const principal = await sessions.validateRefresh(
			payload,
			tokens.refreshToken,
		);
		await sessions.rotate(principal);
		await expect(sessions.rotate(principal)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
		expect((await stored()).map((r) => [r.type, r.subjectUserId])).toEqual([
			['REFRESH_REUSE_DETECTED', user.id],
		]);
	});

	it('3B-4: records a completed password reset and the revocation of every session', async () => {
		const user = await createUser(prisma);
		await auth.forgotPassword(user.email);
		const sent = mail.sendPasswordResetEmail.mock.calls.at(-1) as [
			string,
			string,
		];
		await auth.resetPassword(sent[1], 'N3w-Passw0rd');
		expect((await stored()).map((r) => r.type)).toEqual([
			'PASSWORD_RESET_REQUESTED',
			'PASSWORD_RESET_COMPLETED',
			'SESSIONS_REVOKED_ALL',
		]);
	});

	it('3B-4: purges events older than the retention period only', async () => {
		const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
		await prisma.securityEvent.createMany({
			data: [
				{ type: 'LOGIN_FAILED', createdAt: old },
				{ type: 'LOGIN_SUCCEEDED' },
			],
		});
		expect(await events.purgeExpired()).toBe(1);
		expect((await stored()).map((r) => r.type)).toEqual([
			'LOGIN_SUCCEEDED',
		]);
	});
});
