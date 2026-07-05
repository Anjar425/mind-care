import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import { UserService } from '@/user/user.service';
import { UserRole } from '@/user/dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
	) {}

	async register(registerDto: RegisterDto, role: UserRole) {
		const user = await this.userService.create({
			name: registerDto.name,
			email: registerDto.email,
			password: registerDto.password,
			role: role,
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
