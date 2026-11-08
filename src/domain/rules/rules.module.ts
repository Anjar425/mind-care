import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { GroupsModule } from '../groups/groups.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { Dass42RuleAssessmentService } from './conflicts/dass42-rule-assessment.service';
import { RuleConflictCoreService } from './conflicts/rule-conflict-core.service';
import { RuleReferenceService } from './rule-reference.service';
import { RuleRevisionStore } from './rule-revision-store.service';
import { RulesService } from './rules.service';

// Rule authoring plus the conflict core used by authoring, the resolution workflow and
// DASS42 inference. Keeping the core here removes the former rules/rule-conflicts cycle.
@Module({
	imports: [
		PrismaModule,
		CredentialsModule,
		GroupsModule,
		ReferenceDataModule,
	],
	providers: [
		RulesService,
		RuleReferenceService,
		RuleRevisionStore,
		RuleConflictCoreService,
		Dass42RuleAssessmentService,
	],
	exports: [
		RulesService,
		RuleReferenceService,
		RuleRevisionStore,
		RuleConflictCoreService,
		Dass42RuleAssessmentService,
	],
})
export class RulesModule {}
