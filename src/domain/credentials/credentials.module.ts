import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { CredentialStorageService } from './credential-storage.service';
import { ExpertCredentialsService } from './expert-credentials.service';
import { CredentialKeyRotationService } from './credential-key-rotation.service';

@Module({
	imports: [PrismaModule, StorageModule, SecurityEventsModule],
	providers: [
		ExpertCredentialsService,
		CredentialStorageService,
		CredentialEligibilityService,
		CredentialKeyRotationService,
	],
	exports: [
		CredentialKeyRotationService,
		ExpertCredentialsService,
		CredentialStorageService,
		CredentialEligibilityService,
	],
})
export class CredentialsModule {}
