import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { ExpertCredentialsController } from './expert-credentials.controller';
import { AdminCredentialsController } from './admin-credentials.controller';
import { ExpertCredentialsService } from './expert-credentials.service';
import { CredentialStorageService } from './credential-storage.service';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { CredentialMaintenanceService } from './credential-maintenance.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';

@Module({
	imports: [PrismaModule, AuthModule, MailModule, ScheduleModule.forRoot()],
	controllers: [ExpertCredentialsController, AdminCredentialsController],
	providers: [
		ExpertCredentialsService,
		CredentialStorageService,
		CredentialEligibilityService,
		CredentialMaintenanceService,
		RolesGuard,
		VerifiedEmailGuard,
	],
	exports: [CredentialEligibilityService, RolesGuard, VerifiedEmailGuard],
})
export class ExpertCredentialsModule {}
