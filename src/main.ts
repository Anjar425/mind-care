import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApplication } from './common/config/app.setup';
import type { RuntimeEnvironment } from './common/config/environment.config';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const config = app.get(ConfigService<RuntimeEnvironment, true>);
	try {
		setupApplication(app, {
			NODE_ENV: config.get('NODE_ENV', { infer: true }),
			CORS_ORIGIN: config.get('CORS_ORIGIN', { infer: true }),
		});
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
