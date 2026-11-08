import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { RulesModule } from '../rules/rules.module';
import { RuleConflictsService } from './rule-conflicts.service';
import { RuleResolutionService } from './rule-resolution.service';

@Module({
	imports: [PrismaModule, CredentialsModule, RulesModule],
	providers: [RuleConflictsService, RuleResolutionService],
	exports: [RuleConflictsService, RuleResolutionService],
})
export class RuleConflictsModule {}
