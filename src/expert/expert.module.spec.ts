import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { ExpertModule } from './expert.module';
import { ExpertProfileController } from './expert-profile.controller';
import { ExpertProfileService } from './expert-profile.service';
import { ExpertController } from './expert.controller';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createExpertProfileMocks } from '../../test/expert-profile-mocks';
describe('ExpertModule composition', () => {
	let module: TestingModule;
	afterEach(async () => {
		await module?.close();
		jest.clearAllMocks();
	});
	it('should register only the new owner profile controller and reuse real credential eligibility', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		module = await Test.createTestingModule({
			imports: [config, ExpertModule],
		})
			.overrideProvider(PrismaService)
			.useValue(createExpertProfileMocks().prisma)
			.overrideProvider(MailService)
			.useValue({ sendCredentialExpiryReminder: jest.fn() })
			.overrideProvider(MailerService)
			.useValue({ sendMail: jest.fn() })
			.overrideProvider(CredentialMaintenanceService)
			.useValue({ tick: jest.fn() })
			.compile();
		expect(module.get(ExpertProfileController)).toBeDefined();
		expect(module.get(ExpertProfileService)).toBeDefined();
		expect(() => module.get(ExpertController)).toThrow();
	});
});
