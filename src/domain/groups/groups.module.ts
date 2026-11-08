import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ExpertModule } from '../expert/expert.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { GroupEligibilityService } from './group-eligibility.service';
import { GroupsService } from './groups.service';

@Module({
	imports: [
		PrismaModule,
		CredentialsModule,
		ExpertModule,
		ReferenceDataModule,
	],
	providers: [GroupsService, GroupEligibilityService],
	exports: [GroupsService, GroupEligibilityService],
})
export class GroupsModule {}
