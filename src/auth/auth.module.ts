import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { UserService } from '../user/user.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { AuthSessionService } from './auth-session.service';
import { AuthExceptionFilter } from './auth-exception.filter';

@Module({
	imports: [
		PrismaModule,
		MailModule,
		PassportModule,
		JwtModule.register({
			secret: process.env.JWT_ACCESS_SECRET,
			signOptions: { expiresIn: '15m' },
		}),
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		AuthSessionService,
		AuthExceptionFilter,
		UserService,
		JwtStrategy,
		RefreshStrategy,
		JwtAuthGuard,
		RefreshAuthGuard,
	],
})
export class AuthModule {}
