import { runtimeConfigProvider } from '../../../test/runtime-config.mock';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { UserService } from '@/domain/identity/user.service';
import { MailService } from '@/infrastructure/mail/mail.service';
import { UserRole } from '@/shared/types/role';
import { hashToken } from '@/domain/identity/token.util';
import { account, createPrismaMock } from '../../../test/auth-mocks';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { securityEventsProvider } from '../../../test/security-events.mock';

describe('AuthService', () => {
	let service: AuthService;
	let module: TestingModule;
	let prisma: ReturnType<typeof createPrismaMock>;
	let logError: jest.SpyInstance;
	let users: jest.Mocked<
		Pick<UserService, 'register' | 'findForAuthentication'>
	>;
	let sessions: jest.Mocked<
		Pick<AuthSessionService, 'create' | 'rotate' | 'revoke'>
	>;
	let mail: jest.Mocked<
		Pick<
			MailService,
			| 'sendVerificationEmail'
			| 'sendPasswordResetEmail'
			| 'sendAccountExistsEmail'
		>
	>;
	const password = 'Passw0rd123';
	const user = { ...account, password: bcrypt.hashSync(password, 4) };
	const dto = {
		name: 'Example User',
		email: ' USER@Example.com ',
		password,
		confirm_password: password,
	};
	const token = 'a'.repeat(64);

	beforeEach(async () => {
		prisma = createPrismaMock();
		users = { register: jest.fn(), findForAuthentication: jest.fn() };
		sessions = { create: jest.fn(), rotate: jest.fn(), revoke: jest.fn() };
		mail = {
			sendVerificationEmail: jest.fn(),
			sendPasswordResetEmail: jest.fn(),
			sendAccountExistsEmail: jest.fn(),
		};
		logError = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		module = await Test.createTestingModule({
			providers: [
				securityEventsProvider,
				runtimeConfigProvider,
				AuthService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: UserService, useValue: users },
				{ provide: AuthSessionService, useValue: sessions },
				{ provide: MailService, useValue: mail },
			],
		}).compile();
		service = module.get(AuthService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		jest.restoreAllMocks();
		await module.close();
	});

	describe('registration that does not reveal accounts (API-001)', () => {
		const flush = () => new Promise((done) => setImmediate(done));
		const outcome = (created: boolean, verified: boolean) => ({
			created,
			account: {
				id: user.id,
				name: user.name,
				email: 'user@example.com',
				emailVerifiedAt: verified ? new Date() : null,
			},
		});
		let verification: jest.SpyInstance;
		beforeEach(() => {
			verification = jest
				.spyOn(service, 'sendVerificationEmail')
				.mockResolvedValue(undefined);
		});

		it.each([UserRole.USER, UserRole.EXPERT])(
			'should create the account and send a verification link when the email is new (%p)',
			async (role) => {
				users.register.mockResolvedValue(outcome(true, false));
				await expect(
					service.register(dto, role),
				).resolves.toBeUndefined();
				expect(users.register).toHaveBeenCalledWith({
					name: dto.name,
					email: 'user@example.com',
					password,
					role,
				});
				await flush();
				expect(verification).toHaveBeenCalledWith('user@example.com');
				expect(mail.sendAccountExistsEmail).not.toHaveBeenCalled();
			},
		);

		it('should answer exactly like a new sign-up and notify the owner when the email is verified', async () => {
			users.register.mockResolvedValue(outcome(true, false));
			const fresh = await service.register(dto, UserRole.USER);
			users.register.mockResolvedValue(outcome(false, true));
			const existing = await service.register(dto, UserRole.EXPERT);
			expect(existing).toEqual(fresh);
			await flush();
			expect(mail.sendAccountExistsEmail).toHaveBeenCalledWith(
				'user@example.com',
				user.name,
			);
			expect(verification).toHaveBeenCalledTimes(1);
		});

		it('should resend the verification link instead of a notice when the existing account is unverified', async () => {
			users.register.mockResolvedValue(outcome(false, false));
			await service.register(dto, UserRole.USER);
			await flush();
			expect(verification).toHaveBeenCalledWith('user@example.com');
			expect(mail.sendAccountExistsEmail).not.toHaveBeenCalled();
		});

		it('should keep the response and hide the address when the notice cannot be sent', async () => {
			users.register.mockResolvedValue(outcome(false, true));
			mail.sendAccountExistsEmail.mockRejectedValue(
				new Error('SMTP rejected user@example.com'),
			);
			await expect(
				service.register(dto, UserRole.USER),
			).resolves.toBeUndefined();
			await flush();
			expect(logError).toHaveBeenCalledWith(
				'Account notice could not be completed',
			);
			expect(JSON.stringify(logError.mock.calls)).not.toContain(
				'example.com',
			);
		});
	});

	it('should reject administrator registration when invoked outside public controllers', async () => {
		await expect(service.register(dto, UserRole.ADMIN)).rejects.toThrow(
			'Unsupported registration type',
		);
		expect(users.register).not.toHaveBeenCalled();
	});

	it.each([UserRole.USER, UserRole.EXPERT, UserRole.ADMIN])(
		'should authenticate the matching role when password is valid (%p)',
		async (role) => {
			users.findForAuthentication.mockResolvedValue({ ...user, role });
			await service.login(dto, role);
			expect(users.findForAuthentication).toHaveBeenCalledWith(
				'user@example.com',
			);
			expect(sessions.create).toHaveBeenCalledWith(
				user.id,
				user.password,
				role,
			);
		},
	);

	it.each([
		null,
		{ ...user, role: 'EXPERT' as const },
		{ ...user, password: bcrypt.hashSync('Different123', 4) },
	])(
		'should deny authentication when account, role or password is invalid (%p)',
		async (candidate) => {
			users.findForAuthentication.mockResolvedValue(candidate);
			await expect(service.login(dto, UserRole.USER)).rejects.toThrow(
				'Invalid credentials',
			);
			expect(sessions.create).not.toHaveBeenCalled();
		},
	);

	it.each([UserRole.USER, UserRole.EXPERT])(
		'should refuse a session with EMAIL_NOT_VERIFIED when the password is right but the email is unverified (%p)',
		async (role) => {
			users.findForAuthentication.mockResolvedValue({
				...user,
				role,
				emailVerifiedAt: null,
			});
			const failure = service.login(dto, role);
			await expect(failure).rejects.toMatchObject({
				status: 403,
				response: { code: 'EMAIL_NOT_VERIFIED' },
			});
			expect(sessions.create).not.toHaveBeenCalled();
		},
	);

	it('should keep unverified email from deciding the answer when the password is wrong', async () => {
		users.findForAuthentication.mockResolvedValue({
			...user,
			emailVerifiedAt: null,
			password: bcrypt.hashSync('Different123', 4),
		});
		await expect(service.login(dto, UserRole.USER)).rejects.toThrow(
			'Invalid credentials',
		);
	});

	it('should let an operator-provisioned administrator sign in without email verification', async () => {
		users.findForAuthentication.mockResolvedValue({
			...user,
			role: UserRole.ADMIN,
			emailVerifiedAt: null,
		});
		await service.login(dto, UserRole.ADMIN);
		expect(sessions.create).toHaveBeenCalled();
	});

	it('should reject over-limit passwords when login bypasses DTO transformation', async () => {
		await expect(
			service.login(
				{ ...dto, password: 'Aa1' + 'é'.repeat(35) },
				UserRole.USER,
			),
		).rejects.toThrow('72 UTF-8 bytes');
		expect(users.findForAuthentication).not.toHaveBeenCalled();
	});

	it('should delegate rotation when a verified refresh principal is provided', async () => {
		const principal = {
			sub: user.id,
			sid: 'session',
			jti: 'token',
			email: user.email,
			role: user.role,
			type: 'refresh' as const,
			tokenHash: 'hash',
		};
		await service.refresh(principal);
		expect(sessions.rotate).toHaveBeenCalledWith(principal);
	});

	it('should logout only one session when an access principal is provided', async () => {
		const principal = {
			sub: user.id,
			sid: 'session',
			jti: 'token',
			email: user.email,
			role: user.role,
			type: 'access' as const,
		};
		expect(await service.logout(principal)).toEqual({
			message: 'Logged out successfully',
		});
		expect(sessions.revoke).toHaveBeenCalledWith(user.id, 'session');
	});

	it.each(['sendVerificationEmail', 'forgotPassword'] as const)(
		'should return the same empty result when an account does not exist (%p)',
		async (method) => {
			users.findForAuthentication.mockResolvedValue(null);
			await expect(
				service[method](' USER@Example.com '),
			).resolves.toBeUndefined();
			expect(users.findForAuthentication).toHaveBeenCalledWith(
				'user@example.com',
			);
			expect(prisma.$transaction).not.toHaveBeenCalled();
		},
	);

	it('should hash and persist a reset token when an eligible account requests recovery', async () => {
		users.findForAuthentication.mockResolvedValue(user);
		await service.forgotPassword(dto.email);
		expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith(
			'user@example.com',
			expect.stringMatching(/^[a-f0-9]{64}$/),
			user.name,
		);
		const sentToken: unknown = mail.sendPasswordResetEmail.mock.calls[0][1];
		expect(typeof sentToken).toBe('string');
		if (typeof sentToken !== 'string')
			throw new Error('Missing synthetic token');
		expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
			data: {
				userId: user.id,
				tokenHash: hashToken(sentToken),
				expiresAt: expect.any(Date) as unknown,
			},
		});
	});

	it('should issue a verification token when email is unverified', async () => {
		users.findForAuthentication.mockResolvedValue({
			...user,
			emailVerifiedAt: null,
		});
		await service.sendVerificationEmail(dto.email);
		expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: user.id, usedAt: null },
			}),
		);
		expect(mail.sendVerificationEmail).toHaveBeenCalledWith(
			'user@example.com',
			expect.any(String) as unknown,
			user.name,
		);
	});

	it('should avoid issuing another verification token when email is already verified', async () => {
		users.findForAuthentication.mockResolvedValue({
			...user,
			emailVerifiedAt: new Date(),
		});
		await service.sendVerificationEmail(user.email);
		expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
	});

	it.each(['sendVerificationEmail', 'forgotPassword'] as const)(
		'should suppress sensitive provider details when a notification request fails (%p)',
		async (method) => {
			users.findForAuthentication.mockRejectedValue(
				new Error('PRIVATE_EMAIL_OR_TOKEN'),
			);
			await expect(service[method](user.email)).resolves.toBeUndefined();
			expect(logError).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(logError.mock.calls)).not.toContain(
				'PRIVATE_EMAIL_OR_TOKEN',
			);
		},
	);

	it('should verify and consume once when a valid verification token is supplied', async () => {
		prisma.emailVerificationToken.findFirst.mockResolvedValue({
			id: 'verification',
			userId: user.id,
		});
		prisma.emailVerificationToken.updateMany.mockResolvedValue({
			count: 1,
		});
		await expect(service.verifyAccount(token)).resolves.toBeUndefined();
		expect(prisma.user.update).toHaveBeenCalledWith({
			where: { id: user.id },
			data: { emailVerifiedAt: expect.any(Date) as unknown },
			select: { id: true },
		});
	});

	it.each([0, 2])(
		'should reject verification when atomic token consumption does not affect exactly one row (%p)',
		async (count) => {
			prisma.emailVerificationToken.findFirst.mockResolvedValue({
				id: 'verification',
				userId: user.id,
			});
			prisma.emailVerificationToken.updateMany.mockResolvedValue({
				count,
			});
			await expect(service.verifyAccount(token)).rejects.toThrow();
			expect(prisma.user.update).not.toHaveBeenCalled();
		},
	);

	it('should reject verification when the token is missing, expired or used', async () => {
		prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
		await expect(service.verifyAccount(token)).rejects.toThrow(
			'Invalid or expired verification token',
		);
	});

	it('should reset password and revoke all sessions atomically when reset token is valid', async () => {
		prisma.passwordResetToken.findFirst.mockResolvedValue({
			id: 'reset',
			userId: user.id,
		});
		prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
		const result = await service.resetPassword(token, password);
		expect(result).toEqual({ message: 'Password reset successfully' });
		// The emailed reset link proves the mailbox, so it also verifies the email.
		expect(prisma.user.updateMany).toHaveBeenCalledWith({
			where: { id: user.id, emailVerifiedAt: null },
			data: { emailVerifiedAt: expect.any(Date) as unknown },
		});
		expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
			where: { userId: user.id },
		});
		expect(prisma.$transaction).toHaveBeenCalledWith(
			expect.any(Function) as unknown,
			{
				isolationLevel: 'Serializable',
			},
		);
		expect(prisma.user.update).toHaveBeenCalledWith(
			expect.objectContaining({
				select: { id: true },
				data: { password: expect.stringMatching(/^\$2/) as unknown },
			}),
		);
		expect(result).not.toHaveProperty('user');
	});

	it('should reject reset when the token was concurrently consumed', async () => {
		prisma.passwordResetToken.findFirst.mockResolvedValue({
			id: 'reset',
			userId: user.id,
		});
		prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
		await expect(service.resetPassword(token, password)).rejects.toThrow();
		expect(prisma.user.update).not.toHaveBeenCalled();
		expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
	});

	it('should reject reset when password policy fails before any database write', async () => {
		await expect(service.resetPassword(token, 'weak')).rejects.toThrow();
		expect(prisma.passwordResetToken.findFirst).not.toHaveBeenCalled();
	});

	it('should reject reset when the token has expired or does not exist', async () => {
		prisma.passwordResetToken.findFirst.mockResolvedValue(null);
		await expect(service.resetPassword(token, password)).rejects.toThrow(
			'Invalid or expired reset token',
		);
		expect(prisma.$transaction).not.toHaveBeenCalled();
	});
});
