import {
	Injectable,
	UnauthorizedException,
	BadRequestException,
	Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import { UserService } from '@/user/user.service';
import { UserRole } from '@/user/dto/create-user.dto';
import { MailService } from '@/mail/mail.service';
import { generateToken, hashToken } from '@/common/utils/token.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private readonly prismaService: PrismaService,
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
		private readonly mailService: MailService,
	) {}

	async register(registerDto: RegisterDto, role: UserRole) {
		const user = await this.userService.create({
			name: registerDto.name,
			email: registerDto.email,
			password: registerDto.password,
			role: role,
		});

		void this.sendVerificationEmail(user.email).catch((error) => {
			this.logger.error(
				`Failed to send verification email to ${user.email}`,
				error instanceof Error ? error.stack : error,
			);
		});
		
		return user;
	}

	async login(dto: LoginDto) {
		const user = await this.prismaService.user.findUnique({
			where: { email: dto.email },
		});

		if (!user) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const isPasswordValid = await bcrypt.compare(
			dto.password,
			user.password,
		);

		if (!isPasswordValid) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const accessToken = await this.generateAccessToken(user);
		const refreshToken = await this.generateRefreshToken(user);

		await this.saveRefreshToken(user.id, refreshToken);

		return {
			accessToken,
			refreshToken,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
			},
		};
	}

	async refresh(payload: { sub: string; email: string; role: string }) {
		const user = await this.prismaService.user.findUnique({
			where: { id: payload.sub },
			select: { id: true, name: true, email: true, role: true },
		});

		if (!user) {
			throw new UnauthorizedException('Invalid refresh token');
		}

		const accessToken = await this.generateAccessToken({
			id: user.id,
			email: user.email,
			role: user.role,
		});

		return {
			accessToken,
			user,
		};
	}

	async logout(userId: string) {
		await this.prismaService.refreshToken.deleteMany({
			where: { userId },
		});

		return { message: 'Logged out successfully' };
	}

	async sendVerificationEmail(email: string) {
		// Find user by email - return success even if not found (security)
		const user = await this.prismaService.user.findUnique({
			where: { email },
		});

		if (!user) {
			return {
				message: 'If email exists, verification link has been sent',
			};
		}

		// Invalidate old tokens for this user
		await this.prismaService.emailVerificationToken.updateMany({
			where: { userId: user.id, usedAt: null },
			data: { usedAt: new Date() },
		});

		// Generate new token
		const rawToken = generateToken();
		const tokenHash = hashToken(rawToken);
		const expiresAt = new Date(
			Date.now() +
				parseInt(
					process.env.VERIFICATION_TOKEN_EXPIRY_MINUTES || '15',
				) *
					60 *
					1000,
		);

		await this.prismaService.emailVerificationToken.create({
			data: {
				userId: user.id,
				tokenHash,
				expiresAt,
			},
		});

		// Send email
		await this.mailService.sendVerificationEmail(
			email,
			rawToken,
			user.name,
		);
	}

	async verifyAccount(token: string) {
		const tokenHash = hashToken(token);

		const verificationToken =
			await this.prismaService.emailVerificationToken.findFirst({
				where: { tokenHash },
				include: { user: true },
			});

		if (!verificationToken) {
			throw new BadRequestException('Invalid verification token');
		}

		if (verificationToken.usedAt) {
			throw new BadRequestException(
				'Verification token has already been used',
			);
		}

		if (verificationToken.expiresAt < new Date()) {
			throw new BadRequestException('Verification token has expired');
		}

		const result = await this.prismaService.$transaction(async (tx) => {
			const updatedUser = await tx.user.update({
				where: { id: verificationToken.userId },
				data: { email_verified_at: new Date() },
			});

			await tx.emailVerificationToken.update({
				where: { id: verificationToken.id },
				data: { usedAt: new Date() },
			});

			return updatedUser;
		});
	}

	async forgotPassword(email: string) {
		const user = await this.prismaService.user.findUnique({
			where: { email },
		});

		if (!user) return;

		await this.prismaService.passwordResetToken.updateMany({
			where: { userId: user.id, usedAt: null },
			data: { usedAt: new Date() },
		});

		// Generate new token
		const rawToken = generateToken();
		const tokenHash = hashToken(rawToken);
		const expiresAt = new Date(
			Date.now() +
				parseInt(process.env.RESET_TOKEN_EXPIRY_MINUTES || '15') *
					60 *
					1000,
		);

		await this.prismaService.passwordResetToken.create({
			data: {
				userId: user.id,
				tokenHash,
				expiresAt,
			},
		});

		// Send email
		await this.mailService.sendPasswordResetEmail(
			email,
			rawToken,
			user.name,
		);
	}

	async resetPassword(token: string, newPassword: string) {
		const tokenHash = hashToken(token);

		const resetToken =
			await this.prismaService.passwordResetToken.findFirst({
				where: { tokenHash },
				include: { user: true },
			});

		if (!resetToken) {
			throw new BadRequestException('Invalid reset token');
		}

		if (resetToken.usedAt) {
			throw new BadRequestException('Reset token has already been used');
		}

		if (resetToken.expiresAt < new Date()) {
			throw new BadRequestException('Reset token has expired');
		}

		// Hash new password and update user in transaction
		const hashedPassword = await bcrypt.hash(newPassword, 10);

		const result = await this.prismaService.$transaction(async (tx) => {
			const updatedUser = await tx.user.update({
				where: { id: resetToken.userId },
				data: { password: hashedPassword },
			});

			await tx.passwordResetToken.update({
				where: { id: resetToken.id },
				data: { usedAt: new Date() },
			});

			return updatedUser;
		});

		return { message: 'Password reset successfully', user: result };
	}

	private async generateAccessToken(user: {
		id: string;
		email: string;
		role: string;
	}) {
		const payload = {
			sub: user.id,
			email: user.email,
			role: user.role,
		};

		return this.jwtService.sign(payload, {
			secret: process.env.JWT_ACCESS_SECRET || 'access-secret',
			expiresIn: '15m',
		});
	}

	private async generateRefreshToken(user: {
		id: string;
		email: string;
		role: string;
	}) {
		const payload = {
			sub: user.id,
			email: user.email,
			role: user.role,
			type: 'refresh',
		};

		return this.jwtService.sign(payload, {
			secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
			expiresIn: '7d',
		});
	}

	private async saveRefreshToken(userId: string, token: string) {
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

		await this.prismaService.refreshToken.deleteMany({ where: { userId } });

		await this.prismaService.refreshToken.create({
			data: {
				token,
				userId,
				expiresAt,
			},
		});
	}
}
