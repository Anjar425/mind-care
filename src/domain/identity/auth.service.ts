import {
	BadRequestException,
	Injectable,
	Logger,
	ServiceUnavailableException,
	UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { UserService } from '@/domain/identity/user.service';
import { MailService } from '@/infrastructure/mail/mail.service';
import { UserRole } from '@/shared/types/role';
import {
	assertOpaqueToken,
	assertPassword,
	normalizeEmail,
} from '@/domain/identity/account-validation.util';
import { generateToken, hashToken } from '@/domain/identity/token.util';
import { AuthSessionService } from './auth-session.service';
import { withTransaction } from '../../infrastructure/prisma/transaction';
import type {
	AccessPrincipal,
	LoginInput,
	RefreshPrincipal,
	RegisterInput,
} from './identity.types';
import { IDENTITY_TX } from './identity-persistence';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private readonly prismaService: PrismaService,
		private readonly userService: UserService,
		private readonly sessions: AuthSessionService,
		private readonly mailService: MailService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}

	async register(dto: RegisterInput, role: UserRole) {
		if (role !== UserRole.USER && role !== UserRole.EXPERT) {
			throw new BadRequestException('Unsupported registration type');
		}
		const user = await this.userService.create({
			name: dto.name,
			email: normalizeEmail(dto.email),
			password: dto.password,
			role,
		});
		void this.sendVerificationEmail(user.email);
		return {
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				created_at: user.created_at,
			},
		};
	}

	async login(dto: LoginInput, role: UserRole) {
		if (
			typeof dto.password !== 'string' ||
			Buffer.byteLength(dto.password, 'utf8') > 72
		) {
			throw new BadRequestException(
				'password must not exceed 72 UTF-8 bytes',
			);
		}
		const user = await this.userService.findForAuthentication(
			normalizeEmail(dto.email),
		);
		if (
			!user ||
			user.role !== (role as string) ||
			!(await bcrypt.compare(dto.password, user.password))
		) {
			throw new UnauthorizedException('Invalid credentials');
		}
		return this.sessions.create(user.id, user.password, role);
	}

	refresh(principal: RefreshPrincipal) {
		return this.sessions.rotate(principal);
	}

	async logout(principal: AccessPrincipal) {
		await this.sessions.revoke(principal.sub, principal.sid);
		return { message: 'Logged out successfully' };
	}

	async sendVerificationEmail(email: string): Promise<void> {
		try {
			const user = await this.userService.findForAuthentication(
				normalizeEmail(email),
			);
			if (!user || user.email_verified_at) return;
			const rawToken = generateToken();
			const expiresAt = this.expiry(
				this.config.get('VERIFICATION_TOKEN_EXPIRY_MINUTES', {
					infer: true,
				}),
			);
			await withTransaction(
				this.prismaService,
				async (tx) => {
					await tx.emailVerificationToken.updateMany({
						where: { userId: user.id, usedAt: null },
						data: { usedAt: new Date() },
					});
					await tx.emailVerificationToken.create({
						data: {
							userId: user.id,
							tokenHash: hashToken(rawToken),
							expiresAt,
						},
					});
				},
				IDENTITY_TX,
			);
			await this.mailService.sendVerificationEmail(
				normalizeEmail(user.email),
				rawToken,
				user.name,
			);
		} catch {
			// Never log email, token, provider errors or request contents.
			this.logger.error('Verification request could not be completed');
		}
	}

	async verifyAccount(token: string): Promise<void> {
		assertOpaqueToken(token);
		await withTransaction(
			this.prismaService,
			async (tx) => {
				const verification = await tx.emailVerificationToken.findFirst({
					where: {
						tokenHash: hashToken(token),
						usedAt: null,
						expiresAt: { gt: new Date() },
					},
				});
				if (!verification)
					throw new BadRequestException(
						'Invalid or expired verification token',
					);
				const now = new Date();
				const consumed = await tx.emailVerificationToken.updateMany({
					where: {
						id: verification.id,
						usedAt: null,
						expiresAt: { gt: now },
					},
					data: { usedAt: now },
				});
				if (consumed.count !== 1)
					throw new BadRequestException(
						'Invalid or expired verification token',
					);
				await tx.user.update({
					where: { id: verification.userId },
					data: { email_verified_at: now },
					select: { id: true },
				});
			},
			IDENTITY_TX,
		);
	}

	async forgotPassword(email: string): Promise<void> {
		try {
			const user = await this.userService.findForAuthentication(
				normalizeEmail(email),
			);
			if (!user) return;
			const rawToken = generateToken();
			const expiresAt = this.expiry(
				this.config.get('RESET_TOKEN_EXPIRY_MINUTES', { infer: true }),
			);
			await withTransaction(
				this.prismaService,
				async (tx) => {
					await tx.passwordResetToken.updateMany({
						where: { userId: user.id, usedAt: null },
						data: { usedAt: new Date() },
					});
					await tx.passwordResetToken.create({
						data: {
							userId: user.id,
							tokenHash: hashToken(rawToken),
							expiresAt,
						},
					});
				},
				IDENTITY_TX,
			);
			await this.mailService.sendPasswordResetEmail(
				normalizeEmail(user.email),
				rawToken,
				user.name,
			);
		} catch {
			this.logger.error(
				'Password recovery request could not be completed',
			);
		}
	}

	async resetPassword(token: string, newPassword: string) {
		assertPassword(newPassword);
		assertOpaqueToken(token);
		const reset = await this.prismaService.passwordResetToken.findFirst({
			where: {
				tokenHash: hashToken(token),
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});
		if (!reset)
			throw new BadRequestException('Invalid or expired reset token');
		const password = await bcrypt.hash(newPassword, 10);
		await withTransaction(
			this.prismaService,
			async (tx) => {
				const now = new Date();
				const consumed = await tx.passwordResetToken.updateMany({
					where: {
						id: reset.id,
						usedAt: null,
						expiresAt: { gt: now },
					},
					data: { usedAt: now },
				});
				if (consumed.count !== 1)
					throw new BadRequestException(
						'Invalid or expired reset token',
					);
				await tx.user.update({
					where: { id: reset.userId },
					data: { password },
					select: { id: true },
				});
				await tx.refreshToken.deleteMany({
					where: { userId: reset.userId },
				});
				await tx.passwordResetToken.updateMany({
					where: { userId: reset.userId, usedAt: null },
					data: { usedAt: now },
				});
			},
			IDENTITY_TX,
		);
		return { message: 'Password reset successfully' };
	}

	private expiry(configuredMinutes: number | undefined): Date {
		// Preserve the existing 15-minute fallback; deployment policy is still undecided.
		const minutes = configuredMinutes ? Number(configuredMinutes) : 15;
		const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
		if (
			!Number.isInteger(minutes) ||
			minutes <= 0 ||
			!Number.isFinite(expiresAt.getTime())
		) {
			throw new ServiceUnavailableException(
				'Authentication configuration is unavailable',
			);
		}
		return expiresAt;
	}
}
