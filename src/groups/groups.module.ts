import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ExpertModule } from '../expert/expert.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { GroupsController } from './groups.controller';
import { GroupInvitationsController } from './group-invitations.controller';
import { GroupLeadershipController } from './group-leadership.controller';
import { PublicGroupsController } from './public-groups.controller';
import { GroupsService } from './groups.service';
import { GroupEligibilityService } from './group-eligibility.service';

@Module({
	imports: [
		PrismaModule,
		AuthModule,
		ExpertCredentialsModule,
		ExpertModule,
		ReferenceDataModule,
	],
	controllers: [
		GroupsController,
		GroupInvitationsController,
		GroupLeadershipController,
		PublicGroupsController,
	],
	providers: [GroupsService, GroupEligibilityService],
	exports: [GroupEligibilityService],
})
export class GroupsModule {}
