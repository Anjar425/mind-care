import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { RuleStorageModule } from '../rules/rule-storage.module';
import { RuleReferenceService } from '../rules/rule-reference.service';
import { RuleConflictCoreModule } from './rule-conflict-core.module';
import { RuleResolutionService } from './rule-resolution.service';
import { RuleConflictsService } from './rule-conflicts.service';
import { Dass42RuleAssessmentService } from './dass42-rule-assessment.service';
import {
	RuleConflictsController,
	ConflictNotificationsController,
	AdminRuleConflictsController,
} from './rule-conflicts.controller';
@Module({
	imports: [
		AuthModule,
		PrismaModule,
		GroupsModule,
		ExpertCredentialsModule,
		ReferenceDataModule,
		RuleStorageModule,
		RuleConflictCoreModule,
	],
	controllers: [
		RuleConflictsController,
		ConflictNotificationsController,
		AdminRuleConflictsController,
	],
	providers: [
		RuleReferenceService,
		RuleResolutionService,
		RuleConflictsService,
		Dass42RuleAssessmentService,
	],
	exports: [Dass42RuleAssessmentService],
})
export class RuleConflictsModule {}
