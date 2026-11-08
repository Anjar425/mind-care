import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { GroupsModule } from '../groups/groups.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { QdssCalibrationService } from './qdss-calibration.service';
import { QdssEvaluationService } from './qdss-evaluation.service';
import { QdssModelService } from './qdss-model.service';
import { QdssSnapshotService } from './qdss-snapshot.service';

@Module({
	imports: [
		PrismaModule,
		CredentialsModule,
		GroupsModule,
		ReferenceDataModule,
	],
	providers: [
		QdssCalibrationService,
		QdssSnapshotService,
		QdssModelService,
		QdssEvaluationService,
	],
	exports: [QdssCalibrationService, QdssModelService, QdssEvaluationService],
})
export class QdssModule {}
