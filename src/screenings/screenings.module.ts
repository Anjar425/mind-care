import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { QdssModule } from '../qdss/qdss.module';
import { Dass42InferenceModule } from '../dass42-inference/dass42-inference.module';
import { ScreeningsController } from './screenings.controller';
import { ScreeningsService } from './screenings.service';
import { ScreeningPresentationService } from './screening-presentation.service';
import { OptionalScreeningAuthGuard } from './optional-screening-auth.guard';
@Module({
	imports: [
		AuthModule,
		PrismaModule,
		ReferenceDataModule,
		QdssModule,
		Dass42InferenceModule,
	],
	controllers: [ScreeningsController],
	providers: [
		ScreeningsService,
		ScreeningPresentationService,
		OptionalScreeningAuthGuard,
	],
})
export class ScreeningsModule {}
