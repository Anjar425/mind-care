import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountApiModule } from './api/account/account-api.module';
import { AdminApiModule } from './api/admin/admin-api.module';
import { ResponseInterceptor } from './api/common/interceptors/response.interceptor';
import { ApiRateLimitGuard } from './api/common/rate-limit/api-rate-limit.guard';
import { ExpertApiModule } from './api/expert/expert-api.module';
import { HealthModule } from './api/health/health.module';
import { PublicApiModule } from './api/public/public-api.module';
import type { RuntimeEnvironment } from './infrastructure/config/environment.config';
import { RuntimeConfigModule } from './infrastructure/config/runtime-config.module';
import { PostgresThrottlerStorage } from './infrastructure/rate-limit/postgres-throttler.storage';
import { RateLimitStoreModule } from './infrastructure/rate-limit/rate-limit-store.module';
import { JobsModule } from './jobs/jobs.module';

// Composition root: HTTP audiences (api/*), background jobs and runtime configuration.
// Domain and infrastructure modules are imported by the modules that use them.
@Module({
	imports: [
		RuntimeConfigModule,
		ThrottlerModule.forRootAsync({
			imports: [RateLimitStoreModule],
			inject: [ConfigService, PostgresThrottlerStorage],
			// Counters live in PostgreSQL so every API instance enforces one shared quota.
			useFactory: (
				config: ConfigService<RuntimeEnvironment, true>,
				storage: PostgresThrottlerStorage,
			) => ({
				throttlers: [
					{
						ttl: config.get('RATE_LIMIT_WINDOW_MS', {
							infer: true,
						}),
						limit: config.get('RATE_LIMIT_GENERAL', {
							infer: true,
						}),
					},
				],
				storage,
			}),
		}),
		HealthModule,
		PublicApiModule,
		AccountApiModule,
		ExpertApiModule,
		AdminApiModule,
		JobsModule,
	],
	providers: [
		ResponseInterceptor,
		{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
	],
})
export class AppModule {}
