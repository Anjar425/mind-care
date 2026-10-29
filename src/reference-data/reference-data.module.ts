import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferenceDataController } from './reference-data.controller';
import { ReferenceDataService } from './reference-data.service';

@Module({
	imports: [PrismaModule],
	controllers: [ReferenceDataController],
	providers: [ReferenceDataService],
	exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
