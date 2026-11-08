import { Module } from '@nestjs/common';
import { CredentialsModule } from '../../domain/credentials/credentials.module';
import { QdssModule } from '../../domain/qdss/qdss.module';
import { RuleConflictsModule } from '../../domain/rule-conflicts/rule-conflicts.module';
import { RulesModule } from '../../domain/rules/rules.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthGuardsModule } from '../common/auth/auth-guards.module';
import { AdminCredentialsController } from './expert-credentials/admin-credentials.controller';
import { QdssAdminController } from './qdss-global/qdss-admin.controller';
import { AdminRuleConflictsController } from './rule-conflicts/admin-rule-conflicts.controller';

// Routes for ADMIN accounts: credential review, global QDSS governance, conflict oversight.
@Module({
	imports: [
		AuthGuardsModule,
		PrismaModule,
		CredentialsModule,
		RulesModule,
		RuleConflictsModule,
		QdssModule,
	],
	controllers: [
		AdminCredentialsController,
		AdminRuleConflictsController,
		QdssAdminController,
	],
})
export class AdminApiModule {}
