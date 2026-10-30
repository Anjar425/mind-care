import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
	imports: [TerminusModule.forRoot({ logger: false }), PrismaModule],
	controllers: [HealthController],
	providers: [HealthService],
})
export class HealthModule {}
