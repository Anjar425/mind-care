import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { ScreeningsModule } from './screenings.module';
import { ScreeningsService } from './screenings.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { screeningMocks } from '../../test/screening-mocks';
describe('Actual screening feature module with synthetic providers', () => {
	it('should compose both engines and optional auth without env/database/email startup', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		const module = await Test.createTestingModule({
			imports: [config, ScreeningsModule],
		})
			.overrideProvider(PrismaService)
			.useValue(screeningMocks().prisma)
			.overrideProvider(MailService)
			.useValue({ sendCredentialExpiryReminder: jest.fn() })
			.overrideProvider(MailerService)
			.useValue({ sendMail: jest.fn() })
			.overrideProvider(CredentialMaintenanceService)
			.useValue({ tick: jest.fn() })
			.compile();
		try {
			expect(module.get(ScreeningsService)).toBeDefined();
		} finally {
			await module.close();
		}
	});
});
