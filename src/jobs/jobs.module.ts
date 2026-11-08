import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CredentialsModule } from '../domain/credentials/credentials.module';
import { MailModule } from '../infrastructure/mail/mail.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { JobLeaseService } from '../infrastructure/prisma/job-lease.service';
import { RateLimitStoreModule } from '../infrastructure/rate-limit/rate-limit-store.module';
import { CredentialMaintenanceJob } from './credential-maintenance.job';

// The only place that registers the scheduler. Background work never lives in api/ or domain/.
@Module({
	imports: [
		ScheduleModule.forRoot(),
		PrismaModule,
		MailModule,
		CredentialsModule,
		RateLimitStoreModule,
	],
	providers: [JobLeaseService, CredentialMaintenanceJob],
})
export class JobsModule {}
