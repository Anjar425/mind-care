import { Module } from '@nestjs/common';
import { GroupsModule } from '../../domain/groups/groups.module';
import { IdentityModule } from '../../domain/identity/identity.module';
import { ReferenceDataModule } from '../../domain/reference-data/reference-data.module';
import { ScreeningModule } from '../../domain/screening/screening.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthGuardsModule } from '../common/auth/auth-guards.module';
import { AuthController } from './auth/auth.controller';
import { PublicGroupsController } from './groups/public-groups.controller';
import { ReferenceDataController } from './references/reference-data.controller';
import { OptionalScreeningAuthGuard } from './screenings/optional-screening-auth.guard';
import { ScreeningsController } from './screenings/screenings.controller';

// Routes reachable without an account (guests), plus sign-in and registration.
@Module({
	imports: [
		AuthGuardsModule,
		PrismaModule,
		IdentityModule,
		ReferenceDataModule,
		GroupsModule,
		ScreeningModule,
	],
	controllers: [
		AuthController,
		ReferenceDataController,
		PublicGroupsController,
		ScreeningsController,
	],
	providers: [OptionalScreeningAuthGuard],
})
export class PublicApiModule {}
