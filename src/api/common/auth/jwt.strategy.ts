import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../../../infrastructure/config/environment.config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSessionService } from '../../../domain/identity/auth-session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly sessions: AuthSessionService,
		config: ConfigService<RuntimeEnvironment, true>,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
			algorithms: ['HS256'],
		});
	}

	validate(payload: unknown) {
		return this.sessions.validateAccess(payload);
	}
}
