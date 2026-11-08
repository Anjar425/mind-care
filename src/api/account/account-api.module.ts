import { Module } from '@nestjs/common';
import { HistoryModule } from '../../domain/history/history.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthGuardsModule } from '../common/auth/auth-guards.module';
import { HistoryController } from './history/history.controller';

// Routes owned by the signed-in USER/EXPERT account itself.
@Module({
	imports: [AuthGuardsModule, PrismaModule, HistoryModule],
	controllers: [HistoryController],
})
export class AccountApiModule {}
