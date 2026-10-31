import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { GroupsModule } from './groups.module';
import { GroupsController } from './groups.controller';
import { GroupInvitationsController } from './group-invitations.controller';
import { GroupLeadershipController } from './group-leadership.controller';
import { PublicGroupsController } from './public-groups.controller';
import { GroupsService } from './groups.service';
import { GroupEligibilityService } from './group-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CredentialMaintenanceService } from '../expert-credentials/credential-maintenance.service';
import { syntheticConfig } from '../../test/runtime-config.mock';
import { createGroupsMocks } from '../../test/groups-mocks';

describe('GroupsModule integration', () => {
	let module: TestingModule;
	afterEach(async () => {
		await module?.close();
		jest.clearAllMocks();
	});
	it('should compose actual auth, credential, profile and reference providers without contacting database/mail or reading environment', async () => {
		const config = await ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: true,
			skipProcessEnv: true,
			load: [() => syntheticConfig],
		});
		module = await Test.createTestingModule({
			imports: [config, GroupsModule],
		})
			.overrideProvider(PrismaService)
			.useValue(createGroupsMocks().prisma)
			.overrideProvider(MailService)
			.useValue({ sendCredentialExpiryReminder: jest.fn() })
			.overrideProvider(MailerService)
			.useValue({ sendMail: jest.fn() })
			.overrideProvider(CredentialMaintenanceService)
			.useValue({ tick: jest.fn() })
			.compile();
		for (const provider of [
			GroupsController,
			GroupInvitationsController,
			GroupLeadershipController,
			PublicGroupsController,
			GroupsService,
			GroupEligibilityService,
		])
			expect(module.get(provider)).toBeDefined();
	});
});
