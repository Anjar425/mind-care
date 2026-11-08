import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { ExpertPreferencesCompletenessService } from './expert-preferences-completeness.service';
import { ExpertPreferencesService } from './expert-preferences.service';

@Module({
	imports: [PrismaModule, CredentialsModule, ReferenceDataModule],
	providers: [ExpertPreferencesService, ExpertPreferencesCompletenessService],
	exports: [ExpertPreferencesService, ExpertPreferencesCompletenessService],
})
export class PreferencesModule {}
