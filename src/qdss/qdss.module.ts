import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { ExpertCredentialsModule } from '../expert-credentials/expert-credentials.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { QdssCalibrationService } from './qdss-calibration.service';
import { QdssSnapshotService } from './qdss-snapshot.service';
import { QdssModelService } from './qdss-model.service';
import { QdssEvaluationService } from './qdss-evaluation.service';
import {
	QdssAdminController,
	QdssGroupController,
	QdssGlobalSamplesController,
} from './qdss.controllers';
@Module({
	imports: [
		AuthModule,
		PrismaModule,
		GroupsModule,
		ExpertCredentialsModule,
		ReferenceDataModule,
	],
	controllers: [
		QdssAdminController,
		QdssGroupController,
		QdssGlobalSamplesController,
	],
	providers: [
		QdssCalibrationService,
		QdssSnapshotService,
		QdssModelService,
		QdssEvaluationService,
	],
	exports: [QdssEvaluationService],
})
export class QdssModule {}
