import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { metrics, metricsRegistry, startMetricsServer } from './metrics';

describe('Metrics endpoint', () => {
	let server: Server;
	let base: string;

	beforeAll(async () => {
		server = startMetricsServer(0);
		await new Promise<void>((resolve) => server.once('listening', resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		metricsRegistry.resetMetrics();
	});

	it('should expose application and process metrics in Prometheus format', async () => {
		metrics.rateLimitRejections.inc({ limit: 'login' });
		const response = await fetch(`${base}/metrics`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/plain');
		const body = await response.text();
		expect(body).toContain('rate_limit_rejections_total{limit="login"} 1');
		expect(body).toContain('http_request_duration_seconds');
		expect(body).toContain('process_cpu_user_seconds_total');
	});

	it('should serve nothing else', async () => {
		expect((await fetch(`${base}/`)).status).toBe(404);
		expect(
			(await fetch(`${base}/metrics`, { method: 'POST' })).status,
		).toBe(404);
	});
});
