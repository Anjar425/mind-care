import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { metrics } from '../../../infrastructure/observability/metrics';
import { requestContext } from '../../../infrastructure/observability/request-context';
import {
	requestIdOf,
	requestObservability,
} from './request-observability.middleware';

const UUID = /^[0-9a-f-]{36}$/;

function fakeRequest(overrides: Partial<Request> = {}) {
	return {
		method: 'POST',
		url: '/api/v1/account/history/entries/abc?token=PRIVATE_QUERY',
		originalUrl: '/api/v1/account/history/entries/abc?token=PRIVATE_QUERY',
		baseUrl: '',
		ip: '203.0.113.9',
		headers: {
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)',
			authorization: 'Bearer PRIVATE_TOKEN',
		},
		body: { ciphertext: 'PRIVATE_BODY' },
		...overrides,
	} as unknown as Request;
}

function fakeResponse() {
	const emitter = new EventEmitter();
	const headers: Record<string, unknown> = {};
	return Object.assign(emitter, {
		statusCode: 200,
		locals: {},
		headers,
		setHeader: (name: string, value: unknown) => (headers[name] = value),
	}) as unknown as Response & { headers: Record<string, unknown> };
}

describe('requestObservability', () => {
	afterEach(() => jest.restoreAllMocks());

	it('should assign a fresh request id, expose it and open the request context', () => {
		const req = fakeRequest();
		const res = fakeResponse();
		let seen: unknown;
		const next: NextFunction = () => {
			seen = requestContext.current();
		};
		requestObservability({ trustIncomingRequestId: false })(req, res, next);
		const id = requestIdOf(req);
		expect(id).toMatch(UUID);
		expect(res.headers['X-Request-Id']).toBe(id);
		expect(seen).toEqual({
			requestId: id,
			ip: '203.0.113.9',
			userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
		});
	});

	it('should accept an incoming UUID only from a trusted proxy', () => {
		const incoming = '0B6F8E2A-4C1D-4F7A-9A51-2F3C1D8E7B90';
		const trusted = fakeRequest({ headers: { 'x-request-id': incoming } });
		requestObservability({ trustIncomingRequestId: true })(
			trusted,
			fakeResponse(),
			() => undefined,
		);
		expect(requestIdOf(trusted)).toBe(incoming.toLowerCase());
		for (const [trust, value] of [
			[false, incoming],
			[true, 'not-a-uuid'],
			[true, 'x'.repeat(5000)],
		] as const) {
			const req = fakeRequest({ headers: { 'x-request-id': value } });
			requestObservability({ trustIncomingRequestId: trust })(
				req,
				fakeResponse(),
				() => undefined,
			);
			expect(requestIdOf(req)).not.toBe(value.toLowerCase());
			expect(requestIdOf(req)).toMatch(UUID);
		}
	});

	it('should log one allow-listed line with the route template and record latency', () => {
		const lines: unknown[] = [];
		const logger = {
			info: (o: unknown) => lines.push(o),
			warn: (o: unknown) => lines.push(o),
			error: (o: unknown) => lines.push(o),
		} as unknown as Logger;
		const observe = jest.spyOn(metrics.httpRequestDuration, 'observe');
		const req = fakeRequest();
		const res = fakeResponse();
		requestObservability({ trustIncomingRequestId: false, logger })(
			req,
			res,
			() => undefined,
		);
		Object.assign(req, {
			route: { path: '/api/v1/account/history/entries/:id' },
			user: { sub: 'user-1', role: 'USER', email: 'PRIVATE_EMAIL' },
		});
		res.statusCode = 409;
		res.locals.errorCode = 'HISTORY_STATE_CHANGED';
		res.emit('finish');
		expect(lines).toHaveLength(1);
		expect(lines[0]).toEqual({
			requestId: requestIdOf(req),
			method: 'POST',
			route: '/api/v1/account/history/entries/:id',
			status: 409,
			durationMs: expect.any(Number) as unknown,
			role: 'USER',
			userIdHash: expect.stringMatching(/^[0-9a-f]{16}$/) as unknown,
			errorCode: 'HISTORY_STATE_CHANGED',
		});
		expect(JSON.stringify(lines)).not.toMatch(/PRIVATE|203\.0\.113|user-1/);
		expect(observe).toHaveBeenCalledWith(
			{
				route: '/api/v1/account/history/entries/:id',
				method: 'POST',
				status: '409',
			},
			expect.any(Number),
		);
	});

	it('should label unmatched routes without the URL', () => {
		const observe = jest.spyOn(metrics.httpRequestDuration, 'observe');
		const res = fakeResponse();
		res.statusCode = 404;
		requestObservability({ trustIncomingRequestId: false })(
			fakeRequest(),
			res,
			() => undefined,
		);
		res.emit('finish');
		expect(observe).toHaveBeenCalledWith(
			expect.objectContaining({ route: 'unmatched', status: '404' }),
			expect.any(Number),
		);
	});
});
