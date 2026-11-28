import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

/**
 * JwtModule is registered WITHOUT default options on purpose. `JwtService.sign` merges module
 * `signOptions` under every call, and `jsonwebtoken` rejects a default `expiresIn` together with
 * the refresh token's own `exp` claim (BE-001: every login and refresh returned 500). Each call in
 * `AuthSessionService.sign` passes its own key, key id, algorithm and lifetime.
 */
export const IDENTITY_JWT_OPTIONS = {} as const;

@Module({
	imports: [
		PrismaModule,
		MailModule,
		SecurityEventsModule,
		JwtModule.register(IDENTITY_JWT_OPTIONS),
	],
	providers: [AuthService, AuthSessionService, UserService],
	exports: [AuthService, AuthSessionService, UserService],
})
export class IdentityModule {}
