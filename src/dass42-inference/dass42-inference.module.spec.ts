import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { Dass42InferenceModule } from './dass42-inference.module';
import { Dass42InferenceService } from './dass42-inference.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createRulesMocks } from '../../test/rules-mocks';

it('should compose the actual internal module without controllers, environment or external services', async () => {
	const config = await ConfigModule.forRoot({
		isGlobal: true,
		ignoreEnvFile: true,
		skipProcessEnv: true,
		load: [() => syntheticConfig],
	});
	const module = await Test.createTestingModule({
		imports: [config, Dass42InferenceModule],
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
		expect(module.get(Dass42InferenceService)).toBeDefined();
		expect(
			Reflect.getMetadata('controllers', Dass42InferenceModule),
		).toBeUndefined();
	} finally {
		await module.close();
	}
});
