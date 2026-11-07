import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleReferenceService } from './rule-reference.service';
import { RuleStorageModule } from './rule-storage.module';
import { RuleConflictCoreModule } from '../rule-conflicts/rule-conflict-core.module';

@Module({
	imports: [
		AuthModule,
		PrismaModule,
		ExpertCredentialsModule,
		ReferenceDataModule,
		RuleStorageModule,
		RuleConflictCoreModule,
	],
	controllers: [RulesController],
	providers: [RulesService, RuleReferenceService],
})
export class RulesModule {}
