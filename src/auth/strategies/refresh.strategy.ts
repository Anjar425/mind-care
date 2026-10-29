import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthSessionService } from '../auth-session.service';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh-jwt') {
	constructor(private readonly sessions: AuthSessionService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: process.env.JWT_REFRESH_SECRET,
			algorithms: ['HS256'],
			passReqToCallback: true,
		});
	}

	validate(request: Request, payload: unknown) {
		const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
		return this.sessions.validateRefresh(payload, token ?? '');
	}
}
