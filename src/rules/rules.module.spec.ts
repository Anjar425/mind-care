import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { RulesModule } from './rules.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleReferenceService } from './rule-reference.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createRulesMocks } from '../../test/rules-mocks';
describe('RulesModule composition', () => {
	let module: TestingModule;
	afterEach(async () => {
		await module?.close();
		jest.clearAllMocks();
	});
	it('should resolve real providers without profile/publication/engine prerequisites or real connections', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		module = await Test.createTestingModule({
			imports: [config, RulesModule],
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
		for (const p of [RulesController, RulesService, RuleReferenceService])
			expect(module.get(p)).toBeDefined();
	});
});
