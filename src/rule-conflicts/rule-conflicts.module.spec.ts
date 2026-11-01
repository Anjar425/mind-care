import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { RuleConflictsModule } from './rule-conflicts.module';
import { RuleConflictsService } from './rule-conflicts.service';
import { RuleResolutionService } from './rule-resolution.service';
import { Dass42RuleAssessmentService } from './dass42-rule-assessment.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createRulesMocks } from '../../test/rules-mocks';
it('composes the actual conflict module with synthetic config and no datasource/mail/issuer connection', async () => {
	const config = await ConfigModule.forRoot({
		isGlobal: true,
		ignoreEnvFile: true,
		skipProcessEnv: true,
		load: [() => syntheticConfig],
	});
	const module = await Test.createTestingModule({
		imports: [config, RuleConflictsModule],
	})
		.overrideProvider(PrismaService)
		.useValue(createRulesMocks().prisma)
		.overrideProvider(MailService)
		.useValue({ sendCredentialExpiryReminder: jest.fn() })
		.overrideProvider(MailerService)
		.useValue({ sendMail: jest.fn() })
		.overrideProvider(CredentialMaintenanceService)
		.useValue({ tick: jest.fn() })
		.compile();
	try {
		for (const type of [
			RuleConflictsService,
			RuleResolutionService,
			Dass42RuleAssessmentService,
		])
			expect(module.get(type)).toBeDefined();
	} finally {
		await module.close();
	}
});
