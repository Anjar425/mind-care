import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

@Module({
	imports: [
		PrismaModule,
		MailModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) => ({
				secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
				signOptions: { expiresIn: '15m' },
			}),
		}),
	],
	providers: [AuthService, AuthSessionService, UserService],
	exports: [AuthService, AuthSessionService, UserService],
})
export class IdentityModule {}
