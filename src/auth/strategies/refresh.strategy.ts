import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';

interface RefreshTokenPayload {
	sub: string;
	email: string;
	role: string;
	type: 'refresh';
}

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh-jwt') {
	constructor(private readonly prismaService: PrismaService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_REFRESH_SECRET ,
		});
	}

	async validate(payload: RefreshTokenPayload) {
		const token = await this.prismaService.refreshToken.findFirst({
			where: {
				userId: payload.sub,
				expiresAt: {
					gt: new Date(),
				},
			},
		});

		if (!token) {
			throw new UnauthorizedException('Invalid refresh token');
		}

		return payload;
	}
}
