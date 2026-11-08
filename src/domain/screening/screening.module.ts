import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { Dass42Module } from '../dass42/dass42.module';
import { QdssModule } from '../qdss/qdss.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { ScreeningPresentationService } from './screening-presentation.service';
import { ScreeningsService } from './screenings.service';

@Module({
	imports: [PrismaModule, ReferenceDataModule, QdssModule, Dass42Module],
	providers: [ScreeningsService, ScreeningPresentationService],
	exports: [ScreeningsService],
})
export class ScreeningModule {}
