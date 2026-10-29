import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor';
import { UserService } from './user/user.service';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RuntimeConfigModule } from './common/config/runtime-config.module';
import { ApiRateLimitGuard } from './common/guards/api-rate-limit.guard';
import { HealthModule } from './health/health.module';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from './common/config/environment.config';

@Module({
	imports: [
		RuntimeConfigModule,
		ThrottlerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) => [
				{
					ttl: config.get('RATE_LIMIT_WINDOW_MS', { infer: true }),
					limit: config.get('RATE_LIMIT_GENERAL', { infer: true }),
				},
			],
		}),
		AuthModule,
		PrismaModule,
		HealthModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		ResponseInterceptor,
		UserService,
		{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
	],
})
export class AppModule {}
