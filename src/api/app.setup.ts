import {
	INestApplication,
	RequestMethod,
	ValidationPipe,
	VersioningType,
	type Type,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { RuntimeEnvironment } from '../infrastructure/config/environment.config';
import {
	API_BASE_PATH,
	API_PREFIX,
	API_VERSION,
} from '../shared/contracts/api';
import { HistoryController } from './account/history/history.controller';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { historyPrivacyMiddleware } from './common/privacy/history-privacy.middleware';
import { screeningPrivacyMiddleware } from './common/privacy/screening-privacy.middleware';
import { setupSwagger } from './common/swagger/setup-swagger';
import { requestObservability } from './common/observability/request-observability.middleware';
import { ScreeningsController } from './public/screenings/screenings.controller';

/** Probes stay at /health/* for container health checks and load balancers. */
export const UNVERSIONED_ROUTES = [
	{ path: 'health/live', method: RequestMethod.GET },
	{ path: 'health/ready', method: RequestMethod.GET },
];

/** `/api/v1` prefix and URI versioning. Also used by scripts/generate-openapi.cjs. */
export function configureRouting(app: INestApplication): void {
	app.setGlobalPrefix(API_PREFIX, { exclude: UNVERSIONED_ROUTES });
	app.enableVersioning({
		type: VersioningType.URI,
		defaultVersion: API_VERSION,
	});
}

/** Public URL prefix of a versioned controller, derived from its own @Controller path. */
export function controllerBasePath(controller: Type): string {
	const path = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
	return `${API_BASE_PATH}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

/**
 * Body-bounding, no-store middleware for health data. It must run before Nest's body parser
 * (module middleware runs after it), so it is mounted on the application at each controller's
 * base path. The path comes from the controller metadata: renaming a route moves the mount too.
 */
export const PRIVACY_BOUNDARIES: ReadonlyArray<[Type, RequestHandler]> = [
	[HistoryController, historyPrivacyMiddleware],
	[ScreeningsController, screeningPrivacyMiddleware],
];

export type ApplicationSettings = Pick<
	RuntimeEnvironment,
	'NODE_ENV' | 'CORS_ORIGIN' | 'SWAGGER_MODE' | 'TRUST_PROXY_HOPS'
>;

/**
 * Production: HSTS (1 year, subdomains), helmet's default strict CSP (incl. upgrade-insecure-
 * requests). Elsewhere HSTS is off and plain-HTTP localhost keeps working.
 */
export function securityHeaders(production: boolean) {
	return helmet(
		production
			? {
					strictTransportSecurity: {
						maxAge: 31536000,
						includeSubDomains: true,
					},
				}
			: {
					strictTransportSecurity: false,
					contentSecurityPolicy: {
						directives: { upgradeInsecureRequests: null },
					},
				},
	);
}

export function setupApplication(
	app: INestApplication,
	config: ApplicationSettings,
	options: { accessLog?: Logger } = {},
): void {
	configureRouting(app);
	// Client IPs (rate limits) come from X-Forwarded-For only across the configured proxy hops.
	if (config.TRUST_PROXY_HOPS > 0)
		(
			app.getHttpAdapter().getInstance() as {
				set(name: string, value: unknown): void;
			}
		).set('trust proxy', config.TRUST_PROXY_HOPS);
	// First: request id, request context, access log and latency metric for every request,
	// including those the privacy middleware rejects before body parsing.
	app.use(
		requestObservability({
			trustIncomingRequestId: config.TRUST_PROXY_HOPS > 0,
			logger: options.accessLog,
		}),
	);
	app.use(securityHeaders(config.NODE_ENV === 'production'));
	// No allowed origin means a same-origin deployment: no CORS headers at all.
	if (config.CORS_ORIGIN.length > 0)
		app.enableCors({
			origin: config.CORS_ORIGIN,
			methods: [
				'GET',
				'HEAD',
				'POST',
				'PUT',
				'PATCH',
				'DELETE',
				'OPTIONS',
			],
			allowedHeaders: ['Content-Type', 'Authorization'],
			credentials: false,
		});
	for (const [controller, middleware] of PRIVACY_BOUNDARIES)
		app.use(controllerBasePath(controller), middleware);
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
	setupSwagger(app, config.SWAGGER_MODE);
}
