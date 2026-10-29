import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../../common/config/environment.config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthSessionService } from '../auth-session.service';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh-jwt') {
	constructor(
		private readonly sessions: AuthSessionService,
		config: ConfigService<RuntimeEnvironment, true>,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
			algorithms: ['HS256'],
			passReqToCallback: true,
		});
	}

	validate(request: Request, payload: unknown) {
		const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
		return this.sessions.validateRefresh(payload, token ?? '');
	}
}
