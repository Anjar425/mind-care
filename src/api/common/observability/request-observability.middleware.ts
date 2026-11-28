import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { metrics } from '../../../infrastructure/observability/metrics';
import { requestContext } from '../../../infrastructure/observability/request-context';

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ObservabilityOptions {
	/** Accept an incoming X-Request-Id (only meaningful behind a trusted proxy that sets it). */
	trustIncomingRequestId: boolean;
	/** Access log destination; omitted in tests that assemble their own application. */
	logger?: Logger;
}

/** The request id assigned by requestObservability(), when it ran for this request. */
export function requestIdOf(req: unknown): string | undefined {
	const id = (req as { id?: unknown } | undefined)?.id;
	return typeof id === 'string' ? id : undefined;
}

/**
 * First middleware of the application:
 * - assigns the request id (X-Request-Id response header, `requestId` in error bodies);
 * - opens the request context read by audit code;
 * - on completion records one allow-listed access log line and the latency metric.
 * Logged fields: requestId, method, route TEMPLATE, status, durationMs, role, userIdHash,
 * errorCode. Never URLs, query strings, headers, bodies, IPs or tokens.
 */
export function requestObservability(
	options: ObservabilityOptions,
): RequestHandler {
	return (req: Request, res: Response, next: NextFunction) => {
		const incoming = req.headers['x-request-id'];
		const requestId =
			options.trustIncomingRequestId &&
			typeof incoming === 'string' &&
			UUID.test(incoming)
				? incoming.toLowerCase()
				: randomUUID();
		(req as { id?: unknown }).id = requestId;
		res.setHeader('X-Request-Id', requestId);
		const started = process.hrtime.bigint();
		res.on('finish', () => {
			const durationMs =
				Number(process.hrtime.bigint() - started) / 1_000_000;
			const route = routeTemplate(req);
			const status = res.statusCode;
			metrics.httpRequestDuration.observe(
				{ route, method: req.method, status: String(status) },
				durationMs / 1000,
			);
			if (!options.logger) return;
			const user = principalOf(req);
			const errorCode = (res.locals as { errorCode?: unknown }).errorCode;
			const level =
				status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
			options.logger[level](
				{
					requestId,
					method: req.method,
					route,
					status,
					durationMs: Math.round(durationMs * 10) / 10,
					...(user && {
						role: user.role,
						userIdHash: createHash('sha256')
							.update(user.sub)
							.digest('hex')
							.slice(0, 16),
					}),
					...(typeof errorCode === 'string' && { errorCode }),
				},
				'request completed',
			);
		});
		requestContext.run(
			{
				requestId,
				ip: req.ip,
				userAgent:
					typeof req.headers['user-agent'] === 'string'
						? req.headers['user-agent']
						: undefined,
			},
			next,
		);
	};
}

/** Express' matched route template, e.g. /api/v1/account/history/entries/:id. */
function routeTemplate(req: Request): string {
	const route: unknown = req.route;
	const path =
		typeof route === 'object' &&
		route !== null &&
		'path' in route &&
		typeof route.path === 'string'
			? route.path
			: undefined;
	return path ? `${req.baseUrl}${path}` : 'unmatched';
}

function principalOf(req: Request): { sub: string; role: string } | undefined {
	const user: unknown = (req as { user?: unknown }).user;
	if (
		typeof user === 'object' &&
		user !== null &&
		'sub' in user &&
		'role' in user &&
		typeof user.sub === 'string' &&
		typeof user.role === 'string'
	)
		return { sub: user.sub, role: user.role };
	return undefined;
}
