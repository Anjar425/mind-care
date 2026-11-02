import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { HistoryVaultService } from './history-vault.service';
@Module({
	imports: [AuthModule, PrismaModule],
	controllers: [HistoryController],
	providers: [RolesGuard, HistoryService, HistoryVaultService],
})
export class HistoryModule {}
