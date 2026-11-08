import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from '../../src/domain/identity/auth-session.service';
import { AuthService } from '../../src/domain/identity/auth.service';
import { UserService } from '../../src/domain/identity/user.service';
import { UserRole } from '../../src/shared/types/role';
import type { MailService } from '../../src/infrastructure/mail/mail.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { createPrisma, createUser, dbConfig, resetData } from './support';

describe('Auth sessions on PostgreSQL', () => {
	const config = dbConfig();
	const jwt = new JwtService({});
	let prisma: PrismaService;
	let sessions: AuthSessionService;
	let auth: AuthService;
	const mail = {
		sendVerificationEmail: jest.fn(),
		sendPasswordResetEmail: jest.fn(),
	};

	beforeAll(() => {
		prisma = createPrisma();
		sessions = new AuthSessionService(prisma, jwt, config);
		auth = new AuthService(
			prisma,
			new UserService(prisma),
			sessions,
			mail as unknown as MailService,
			config,
		);
	});
	beforeEach(async () => {
		jest.clearAllMocks();
		await resetData(prisma);
	});
	afterAll(async () => {
		await prisma.$disconnect();
	});

	const verify = (token: string, kind: 'ACCESS' | 'REFRESH') =>
		jwt.verify<Record<string, unknown>>(token, {
			secret: config.get(`JWT_${kind}_SECRET`, { infer: true }),
		});

	it('D1: concurrent rotation of one refresh token lets at most one win and revokes the session', async () => {
		const user = await createUser(prisma);
		const tokens = await sessions.create(
			user.id,
			user.password,
			UserRole.USER,
		);
		const payload = verify(tokens.refreshToken, 'REFRESH');
		const first = await sessions.validateRefresh(
			payload,
			tokens.refreshToken,
		);
		const second = await sessions.validateRefresh(
			payload,
			tokens.refreshToken,
		);

		const results = await Promise.allSettled([
			sessions.rotate(first),
			sessions.rotate(second),
		]);

		const rejected = results.filter(
			(r): r is PromiseRejectedResult => r.status === 'rejected',
		);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason).toBeInstanceOf(UnauthorizedException);
		// Reuse detection revokes the whole session, including the winner's new tokens.
		expect(
			await prisma.refreshToken.count({
				where: { id: payload.sid as string },
			}),
		).toBe(0);
	});

	it('D2: password reset rejects previous access tokens and removes every session', async () => {
		const user = await createUser(prisma);
		const a = await sessions.create(user.id, user.password, UserRole.USER);
		await sessions.create(user.id, user.password, UserRole.USER);
		const accessPayload = verify(a.accessToken, 'ACCESS');
		await expect(sessions.validateAccess(accessPayload)).resolves.toEqual(
			expect.objectContaining({ sub: user.id }),
		);

		await auth.forgotPassword(user.email);
		expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
		const [[, rawToken]] = mail.sendPasswordResetEmail.mock.calls as [
			string,
			string,
			string,
		][];

		const results = await Promise.allSettled([
			auth.resetPassword(rawToken, 'NewPassw0rd123'),
			auth.resetPassword(rawToken, 'OtherPassw0rd123'),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const failure = results.find(
			(r): r is PromiseRejectedResult => r.status === 'rejected',
		);
		expect(failure?.reason).toBeInstanceOf(BadRequestException);

		await expect(sessions.validateAccess(accessPayload)).rejects.toThrow(
			UnauthorizedException,
		);
		expect(
			await prisma.refreshToken.count({ where: { userId: user.id } }),
		).toBe(0);
		const stored = await prisma.user.findUniqueOrThrow({
			where: { id: user.id },
		});
		expect(stored.password).not.toBe(user.password);
	});
});
