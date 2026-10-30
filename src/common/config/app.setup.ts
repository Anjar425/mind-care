import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ResponseInterceptor } from '../interceptor/response/response.interceptor';
import { HttpExceptionFilter } from '../filter/http-exception/http-exception.filter';
import type { RuntimeEnvironment } from './environment.config';
import { setupSwagger } from './swagger/setup-swagger';

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
	app.useGlobalInterceptors(app.get(ResponseInterceptor));
	app.useGlobalFilters(new HttpExceptionFilter());
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
