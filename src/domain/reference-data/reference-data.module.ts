import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { ReferenceDataService } from './reference-data.service';

@Module({
	imports: [PrismaModule],
	providers: [ReferenceDataService],
	exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
