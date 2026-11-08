import { Module } from '@nestjs/common';
import { CredentialsModule } from '../../domain/credentials/credentials.module';
import { ExpertModule } from '../../domain/expert/expert.module';
import { GroupsModule } from '../../domain/groups/groups.module';
import { PreferencesModule } from '../../domain/preferences/preferences.module';
import { QdssModule } from '../../domain/qdss/qdss.module';
import { RuleConflictsModule } from '../../domain/rule-conflicts/rule-conflicts.module';
import { RulesModule } from '../../domain/rules/rules.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthGuardsModule } from '../common/auth/auth-guards.module';
import { ExpertCredentialsController } from './credentials/expert-credentials.controller';
import { GroupInvitationsController } from './groups/group-invitations.controller';
import { GroupLeadershipController } from './groups/group-leadership.controller';
import { GroupsController } from './groups/groups.controller';
import { QdssGroupController } from './groups/qdss/qdss-group.controller';
import { RuleConflictsController } from './groups/rule-conflicts/rule-conflicts.controller';
import { RulesController } from './groups/rules/rules.controller';
import { ConflictNotificationsController } from './notifications/conflict-notifications.controller';
import { ExpertPreferencesController } from './preferences/expert-preferences.controller';
import { ExpertProfileController } from './profile/expert-profile.controller';
import { QdssGlobalSamplesController } from './qdss-global/qdss-global-samples.controller';

// Routes for EXPERT accounts: own profile, credentials, preferences, groups and governance.
@Module({
	imports: [
		AuthGuardsModule,
		PrismaModule,
		CredentialsModule,
		ExpertModule,
		PreferencesModule,
		GroupsModule,
		RulesModule,
		RuleConflictsModule,
		QdssModule,
	],
	controllers: [
		ExpertCredentialsController,
		ExpertProfileController,
		ExpertPreferencesController,
		GroupsController,
		GroupInvitationsController,
		GroupLeadershipController,
		RulesController,
		RuleConflictsController,
		ConflictNotificationsController,
		QdssGroupController,
		QdssGlobalSamplesController,
	],
})
export class ExpertApiModule {}
