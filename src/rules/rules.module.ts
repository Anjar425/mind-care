import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RuleReferenceService } from './rule-reference.service';

@Module({
	imports: [
		AuthModule,
		PrismaModule,
		ExpertCredentialsModule,
		ReferenceDataModule,
	],
	controllers: [RulesController],
	providers: [RulesService, RuleReferenceService],
})
export class RulesModule {}
