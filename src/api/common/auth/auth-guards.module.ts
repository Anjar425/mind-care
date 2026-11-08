import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { IdentityModule } from '../../../domain/identity/identity.module';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RefreshAuthGuard } from './refresh-auth.guard';
import { RefreshStrategy } from './refresh.strategy';
import { RolesGuard } from './roles.guard';
import { VerifiedEmailGuard } from './verified-email.guard';

// Registers the Passport strategies once and provides the HTTP guards to every api module.
@Module({
	imports: [PassportModule, IdentityModule, PrismaModule],
	providers: [
		JwtStrategy,
		RefreshStrategy,
		JwtAuthGuard,
		RefreshAuthGuard,
		RolesGuard,
		VerifiedEmailGuard,
	],
	exports: [
		PassportModule,
		JwtAuthGuard,
		RefreshAuthGuard,
		RolesGuard,
		VerifiedEmailGuard,
	],
})
export class AuthGuardsModule {}
