import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ExpertProfileController } from './expert-profile.controller';
import { ExpertProfileService } from './expert-profile.service';
import { ExpertProfileCompletenessService } from './expert-profile-completeness.service';

@Module({
	imports: [PrismaModule, AuthModule, ExpertCredentialsModule],
	controllers: [ExpertProfileController],
	providers: [ExpertProfileService, ExpertProfileCompletenessService],
	exports: [ExpertProfileService, ExpertProfileCompletenessService],
})
export class ExpertModule {}
