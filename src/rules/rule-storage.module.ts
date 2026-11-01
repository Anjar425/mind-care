import { Module } from '@nestjs/common';
import { RuleRevisionStore } from './rule-revision-store.service';

@Module({ providers: [RuleRevisionStore], exports: [RuleRevisionStore] })
export class RuleStorageModule {}
