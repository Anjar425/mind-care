import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { HistoryVaultService } from './history-vault.service';
import { HistoryService } from './history.service';

@Module({
	imports: [PrismaModule],
	providers: [HistoryService, HistoryVaultService],
	exports: [HistoryService, HistoryVaultService],
})
export class HistoryModule {}
