import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import type { Logger as RootLogger } from 'pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApplication } from './api/app.setup';
import type { RuntimeEnvironment } from './infrastructure/config/environment.config';
import { ROOT_LOGGER } from './infrastructure/observability/logging.module';
import { startMetricsServer } from './infrastructure/observability/metrics';

async function bootstrap() {
	// Startup logs are buffered until the JSON logger is installed.
	const app = await NestFactory.create(AppModule, { bufferLogs: true });
	app.useLogger(app.get(PinoNestLogger));
	const config = app.get(ConfigService<RuntimeEnvironment, true>);
	try {
		setupApplication(
			app,
			{
				NODE_ENV: config.get('NODE_ENV', { infer: true }),
				CORS_ORIGIN: config.get('CORS_ORIGIN', { infer: true }),
				SWAGGER_MODE: config.get('SWAGGER_MODE', { infer: true }),
				TRUST_PROXY_HOPS: config.get('TRUST_PROXY_HOPS', {
					infer: true,
				}),
			},
			{ accessLog: app.get<RootLogger>(ROOT_LOGGER) },
		);
		const metricsPort = config.get('METRICS_PORT', { infer: true });
		if (metricsPort > 0) startMetricsServer(metricsPort);
		await app.listen(config.get('PORT', { infer: true }));
	} catch {
		await app.close();
		throw new Error('Application startup failed');
	}
}
bootstrap().catch(() => {
	Logger.error('Application startup failed', 'Bootstrap');
	process.exitCode = 1;
});
