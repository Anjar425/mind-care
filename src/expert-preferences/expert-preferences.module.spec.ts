import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { ExpertPreferencesModule } from './expert-preferences.module';
import { ExpertPreferencesController } from './expert-preferences.controller';
import { ExpertPreferencesService } from './expert-preferences.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createExpertPreferencesMocks } from '../../test/expert-preferences-mocks';

describe('ExpertPreferencesModule composition', () => {
	let module: TestingModule;
	afterEach(async () => {
		await module?.close();
		jest.clearAllMocks();
	});
	it('should resolve private auth, credential, catalog and persistence providers without a profile dependency', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		module = await Test.createTestingModule({
			imports: [config, ExpertPreferencesModule],
		})
			.overrideProvider(PrismaService)
			.useValue(createExpertPreferencesMocks().prisma)
			.overrideProvider(MailService)
			.useValue({ sendCredentialExpiryReminder: jest.fn() })
			.overrideProvider(MailerService)
			.useValue({ sendMail: jest.fn() })
			.overrideProvider(CredentialMaintenanceService)
			.useValue({ tick: jest.fn() })
			.compile();
		expect(module.get(ExpertPreferencesController)).toBeDefined();
		expect(module.get(ExpertPreferencesService)).toBeDefined();
	});
});
