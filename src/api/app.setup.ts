import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import type { RuntimeEnvironment } from '../infrastructure/config/environment.config';
import { setupSwagger } from './common/swagger/setup-swagger';
import { historyPrivacyMiddleware } from './common/privacy/history-privacy.middleware';
import { screeningPrivacyMiddleware } from './common/privacy/screening-privacy.middleware';

export function setupApplication(
	app: INestApplication,
	config: Pick<RuntimeEnvironment, 'NODE_ENV' | 'CORS_ORIGIN'>,
): void {
	// Deployment origins, proxy topology and distributed rate policy need separate approval.
	if (config.NODE_ENV === 'production')
		throw new Error('Production runtime policy is pending approval');
	app.use(
		helmet({
			strictTransportSecurity: false,
			contentSecurityPolicy: {
				directives: { upgradeInsecureRequests: null },
			},
		}),
	);
	app.enableCors({
		origin: [config.CORS_ORIGIN],
		methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		credentials: false,
	});
	app.use('/me/history', historyPrivacyMiddleware);
	app.use('/screenings', screeningPrivacyMiddleware);
	app.useGlobalInterceptors(app.get(ResponseInterceptor));
	app.useGlobalFilters(new GlobalExceptionFilter());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);
	app.enableShutdownHooks();
	setupSwagger(app, config.NODE_ENV);
}
