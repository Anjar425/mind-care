import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { RulesModule } from '../rules/rules.module';
import { Dass42InferenceService } from './dass42-inference.service';

@Module({
	imports: [PrismaModule, ReferenceDataModule, RulesModule],
	providers: [Dass42InferenceService],
	exports: [Dass42InferenceService],
})
export class Dass42Module {}
