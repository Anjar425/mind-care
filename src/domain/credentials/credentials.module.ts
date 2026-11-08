import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { CredentialStorageService } from './credential-storage.service';
import { ExpertCredentialsService } from './expert-credentials.service';

@Module({
	imports: [PrismaModule, SecurityEventsModule],
	providers: [
		ExpertCredentialsService,
		CredentialStorageService,
		CredentialEligibilityService,
	],
	exports: [
		ExpertCredentialsService,
		CredentialStorageService,
		CredentialEligibilityService,
	],
})
export class CredentialsModule {}
