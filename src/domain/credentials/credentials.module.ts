import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { CredentialStorageService } from './credential-storage.service';
import { ExpertCredentialsService } from './expert-credentials.service';

@Module({
	imports: [PrismaModule],
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
