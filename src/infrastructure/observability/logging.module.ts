import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import pino, { type Logger } from 'pino';
import type { RuntimeEnvironment } from '../config/environment.config';

export const ROOT_LOGGER = Symbol('ROOT_LOGGER');

/**
 * JSON logs on stdout. Log calls in this codebase pass constant messages only; the request
 * id is bound to every line written while a request is handled. Headers, bodies, query
 * strings, tokens and IPs are never part of a log record (see request-observability.middleware.ts).
 */
export function createRootLogger(
	level: RuntimeEnvironment['LOG_LEVEL'],
): Logger {
	return pino({
		level,
		base: { service: 'mindcare-api' },
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: { level: (label) => ({ level: label }) },
		// Defence in depth: should an object ever be logged, these fields are dropped.
		redact: {
			paths: [
				'req.headers',
				'req.body',
				'req.query',
				'res.headers',
				'*.password',
				'*.token',
				'*.authorization',
				'*.email',
			],
			remove: true,
		},
	});
}

@Module({
	providers: [
		{
			provide: ROOT_LOGGER,
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) =>
				createRootLogger(config.get('LOG_LEVEL', { infer: true })),
		},
	],
	exports: [ROOT_LOGGER],
})
class RootLoggerModule {}

/** Replaces Nest's console logger with pino; access lines come from our own middleware. */
export const LoggingModule = LoggerModule.forRootAsync({
	imports: [RootLoggerModule],
	inject: [ROOT_LOGGER],
	useFactory: (logger: Logger) => ({
		pinoHttp: {
			logger,
			autoLogging: false,
			// Bind only the request id (assigned by the request middleware) to child loggers.
			quietReqLogger: true,
			genReqId: (req: IncomingMessage) =>
				typeof req.id === 'string' ? req.id : randomUUID(),
		},
	}),
});

export { RootLoggerModule };
