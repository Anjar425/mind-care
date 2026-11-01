import { Module } from '@nestjs/common';
import { RuleStorageModule } from '../rules/rule-storage.module';
import { RuleConflictCoreService } from './rule-conflict-core.service';

@Module({
	imports: [RuleStorageModule],
	providers: [RuleConflictCoreService],
	exports: [RuleConflictCoreService],
})
export class RuleConflictCoreModule {}
