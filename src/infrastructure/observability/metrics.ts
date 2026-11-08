import { createServer, type Server } from 'node:http';
import {
	collectDefaultMetrics,
	Counter,
	Histogram,
	Registry,
} from 'prom-client';

/**
 * Application metrics. Labels are bounded: route TEMPLATES (never URLs), action names,
 * event types and result enums. No user, IP or email ever becomes a label.
 */
export const metricsRegistry = new Registry();

export const metrics = {
	httpRequestDuration: new Histogram({
		name: 'http_request_duration_seconds',
		help: 'HTTP request duration by route template, method and status',
		labelNames: ['route', 'method', 'status'] as const,
		buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
		registers: [metricsRegistry],
	}),
	rateLimitRejections: new Counter({
		name: 'rate_limit_rejections_total',
		help: 'Requests rejected by a rate limit, by limit name',
		labelNames: ['limit'] as const,
		registers: [metricsRegistry],
	}),
	rateLimitStoreErrors: new Counter({
		name: 'rate_limit_store_errors_total',
		help: 'Rate-limit store failures, by whether the request was refused',
		labelNames: ['outcome'] as const,
		registers: [metricsRegistry],
	}),
	jobRuns: new Counter({
		name: 'job_runs_total',
		help: 'Scheduled job ticks by job and result',
		labelNames: ['job', 'result'] as const,
		registers: [metricsRegistry],
	}),
	emailSendFailures: new Counter({
		name: 'email_send_failures_total',
		help: 'Emails the SMTP transport refused or could not deliver',
		registers: [metricsRegistry],
	}),
	securityEvents: new Counter({
		name: 'security_events_total',
		help: 'Security events by type and whether they were stored',
		labelNames: ['type', 'stored'] as const,
		registers: [metricsRegistry],
	}),
};

/**
 * Serves GET /metrics on its own port. Never mount it on the public API port; scrape it from
 * inside the private network only. Also starts the default process/runtime metrics.
 */
export function startMetricsServer(port: number): Server {
	collectDefaultMetrics({ register: metricsRegistry });
	const server = createServer((req, res) => {
		if (req.method !== 'GET' || req.url !== '/metrics') {
			res.statusCode = 404;
			res.end();
			return;
		}
		metricsRegistry
			.metrics()
			.then((body) => {
				res.setHeader('Content-Type', metricsRegistry.contentType);
				res.end(body);
			})
			.catch(() => {
				res.statusCode = 500;
				res.end();
			});
	});
	server.listen(port);
	// Never keeps the process alive: shutdown is driven by the API server.
	server.unref();
	return server;
}
