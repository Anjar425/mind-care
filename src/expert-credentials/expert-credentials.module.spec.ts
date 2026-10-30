import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { ExpertCredentialsModule } from './expert-credentials.module';
import { ExpertCredentialsController } from './expert-credentials.controller';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { CredentialMaintenanceService } from './credential-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createCredentialMocks } from '../../test/credential-mocks';

describe('ExpertCredentialsModule composition', () => {
	let module: TestingModule;
	afterEach(async () => {
		await module?.close();
		jest.clearAllMocks();
	});
	it('should resolve auth, mail, scheduler and exported eligibility using isolated configuration', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		module = await Test.createTestingModule({
			imports: [config, ExpertCredentialsModule],
		})
			.overrideProvider(PrismaService)
			.useValue(createCredentialMocks().prisma)
			.overrideProvider(MailService)
			.useValue({ sendCredentialExpiryReminder: jest.fn() })
			.overrideProvider(MailerService)
			.useValue({ sendMail: jest.fn() })
			.compile();
		expect(module.get(ExpertCredentialsController)).toBeDefined();
		expect(module.get(CredentialEligibilityService)).toBeDefined();
		expect(module.get(CredentialMaintenanceService)).toBeDefined();
	});
});
