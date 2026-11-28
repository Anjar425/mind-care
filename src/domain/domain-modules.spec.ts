import { ConfigModule } from '@nestjs/config';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MAIL_TRANSPORT } from '../infrastructure/mail/mail-transport';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { CredentialsModule } from './credentials/credentials.module';
import { CredentialEligibilityService } from './credentials/credential-eligibility.service';
import { ExpertCredentialsService } from './credentials/expert-credentials.service';
import { Dass42Module } from './dass42/dass42.module';
import { Dass42InferenceService } from './dass42/dass42-inference.service';
import { ExpertModule } from './expert/expert.module';
import { ExpertProfileService } from './expert/expert-profile.service';
import { GroupsModule } from './groups/groups.module';
import { GroupEligibilityService } from './groups/group-eligibility.service';
import { GroupsService } from './groups/groups.service';
import { HistoryModule } from './history/history.module';
import { HistoryService } from './history/history.service';
import { HistoryVaultService } from './history/history-vault.service';
import { IdentityModule } from './identity/identity.module';
import { AuthService } from './identity/auth.service';
import { AuthSessionService } from './identity/auth-session.service';
import { PreferencesModule } from './preferences/preferences.module';
import { ExpertPreferencesService } from './preferences/expert-preferences.service';
import { QdssModule } from './qdss/qdss.module';
import { QdssCalibrationService } from './qdss/qdss-calibration.service';
import { QdssEvaluationService } from './qdss/qdss-evaluation.service';
import { QdssModelService } from './qdss/qdss-model.service';
import { ReferenceDataModule } from './reference-data/reference-data.module';
import { ReferenceDataService } from './reference-data/reference-data.service';
import { RuleConflictsModule } from './rule-conflicts/rule-conflicts.module';
import { RuleConflictsService } from './rule-conflicts/rule-conflicts.service';
import { RuleResolutionService } from './rule-conflicts/rule-resolution.service';
import { RulesModule } from './rules/rules.module';
import { Dass42RuleAssessmentService } from './rules/conflicts/dass42-rule-assessment.service';
import { RuleConflictCoreService } from './rules/conflicts/rule-conflict-core.service';
import { RulesService } from './rules/rules.service';
import { ScreeningModule } from './screening/screening.module';
import { ScreeningsService } from './screening/screenings.service';
import { SecurityEventsModule } from './security-events/security-events.module';
import { SecurityEventService } from './security-events/security-event.service';

// Every domain module compiles on its own (its imports are complete), exposes its services
// and registers no HTTP controllers. No database, SMTP server or environment is touched.
const MODULES: [Type, Type[]][] = [
	[IdentityModule, [AuthService, AuthSessionService]],
	[ReferenceDataModule, [ReferenceDataService]],
	[
		CredentialsModule,
		[ExpertCredentialsService, CredentialEligibilityService],
	],
	[ExpertModule, [ExpertProfileService]],
	[PreferencesModule, [ExpertPreferencesService]],
	[GroupsModule, [GroupsService, GroupEligibilityService]],
	[
		RulesModule,
		[RulesService, RuleConflictCoreService, Dass42RuleAssessmentService],
	],
	[RuleConflictsModule, [RuleConflictsService, RuleResolutionService]],
	[
		QdssModule,
		[QdssCalibrationService, QdssModelService, QdssEvaluationService],
	],
	[Dass42Module, [Dass42InferenceService]],
	[ScreeningModule, [ScreeningsService]],
	[HistoryModule, [HistoryService, HistoryVaultService]],
	[SecurityEventsModule, [SecurityEventService]],
];

describe('Domain module composition', () => {
	it.each(MODULES)(
		'%p resolves its services in isolation without controllers',
		async (domainModule, services) => {
			const config = await ConfigModule.forRoot({
				isGlobal: true,
				ignoreEnvFile: true,
				skipProcessEnv: true,
				load: [() => syntheticConfig],
			});
			const module = await Test.createTestingModule({
				imports: [config, domainModule],
			})
				.overrideProvider(PrismaService)
				.useValue({})
				.overrideProvider(MAIL_TRANSPORT)
				.useValue({ sendMail: jest.fn(), close: jest.fn() })
				.compile();
			try {
				for (const service of services)
					expect(module.get(service)).toBeDefined();
				expect(
					Reflect.getMetadata('controllers', domainModule),
				).toBeUndefined();
			} finally {
				await module.close();
			}
		},
	);
});
