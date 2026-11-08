import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ExpertProfileCompletenessService } from './expert-profile-completeness.service';
import { ExpertProfileService } from './expert-profile.service';

@Module({
	imports: [PrismaModule, CredentialsModule],
	providers: [ExpertProfileService, ExpertProfileCompletenessService],
	exports: [ExpertProfileService, ExpertProfileCompletenessService],
})
export class ExpertModule {}
