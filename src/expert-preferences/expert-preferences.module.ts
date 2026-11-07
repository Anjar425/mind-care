import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { ExpertPreferencesController } from './expert-preferences.controller';
import { ExpertPreferencesService } from './expert-preferences.service';
import { ExpertPreferencesCompletenessService } from './expert-preferences-completeness.service';

@Module({
	imports: [
		PrismaModule,
		AuthModule,
		ExpertCredentialsModule,
		ReferenceDataModule,
	],
	controllers: [ExpertPreferencesController],
	providers: [ExpertPreferencesService, ExpertPreferencesCompletenessService],
	exports: [ExpertPreferencesService, ExpertPreferencesCompletenessService],
})
export class ExpertPreferencesModule {}
