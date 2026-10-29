import { Module } from '@nestjs/common';
import { ExpertService } from './expert.service';
import { ExpertController } from './expert.controller';

@Module({
  controllers: [ExpertController],
  providers: [ExpertService],
})
export class ExpertModule {}
