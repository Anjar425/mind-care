import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { SecurityEventService } from './security-event.service';

@Module({
	imports: [PrismaModule],
	providers: [SecurityEventService],
	exports: [SecurityEventService],
})
export class SecurityEventsModule {}
