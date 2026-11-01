import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { RuleConflictsModule } from '../rule-conflicts/rule-conflicts.module';
import { Dass42InferenceService } from './dass42-inference.service';

@Module({
	imports: [PrismaModule, ReferenceDataModule, RuleConflictsModule],
	providers: [Dass42InferenceService],
	exports: [Dass42InferenceService],
})
export class Dass42InferenceModule {}
