import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { QdssModule } from './qdss.module';
import { QdssCalibrationService } from './qdss-calibration.service';
import { QdssModelService } from './qdss-model.service';
import { QdssEvaluationService } from './qdss-evaluation.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createQdssMocks } from '../../test/qdss-mocks';
it('should resolve actual QDSS module providers without environment, database or email connections', async () => {
	const config = await ConfigModule.forRoot({
		isGlobal: true,
		ignoreEnvFile: true,
		skipProcessEnv: true,
		load: [() => syntheticConfig],
	});
	const module = await Test.createTestingModule({
		imports: [config, QdssModule],
	})
		.overrideProvider(PrismaService)
		.useValue(createQdssMocks().prisma)
		.overrideProvider(MailService)
		.useValue({ sendCredentialExpiryReminder: jest.fn() })
		.overrideProvider(MailerService)
		.useValue({ sendMail: jest.fn() })
		.overrideProvider(CredentialMaintenanceService)
		.useValue({ tick: jest.fn() })
		.compile();
	try {
		for (const type of [
			QdssCalibrationService,
			QdssModelService,
			QdssEvaluationService,
		])
			expect(module.get(type)).toBeDefined();
	} finally {
		await module.close();
	}
});
