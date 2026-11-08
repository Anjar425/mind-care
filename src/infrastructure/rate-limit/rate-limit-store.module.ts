import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PostgresThrottlerStorage } from './postgres-throttler.storage';

@Module({
	imports: [PrismaModule],
	providers: [PostgresThrottlerStorage],
	exports: [PostgresThrottlerStorage],
})
export class RateLimitStoreModule {}
