import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { screeningPrivacyMiddleware } from './screening-privacy.middleware';
describe('Early16KiB screening request privacy', () => {
	it.each([
		'valid',
		'chunked-overflow',
		'invalid-utf8',
		'malformed',
		'array',
		'compressed',
		'content-length',
	])('should enforce feature-scoped JSON bounds:%s', (kind) => {
		const req = Object.assign(new EventEmitter(), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(kind === 'compressed'
					? { 'content-encoding': 'gzip' }
					: {}),
				...(kind === 'content-length'
					? { 'content-length': '20000' }
					: {}),
			},
			resume: jest.fn(),
			body: undefined,
		});
		const res = {
			setHeader: jest.fn(),
			status: jest.fn(),
			json: jest.fn(),
		};
		res.status.mockReturnValue(res);
		const next = jest.fn();
		screeningPrivacyMiddleware(
			req as unknown as Request,
			res as unknown as Response,
			next,
		);
		if (kind === 'valid')
			req.emit('data', Buffer.from('{"scope":"GLOBAL"}'));
		if (kind === 'chunked-overflow') {
			req.emit('data', Buffer.alloc(10000));
			req.emit('data', Buffer.alloc(10000));
		}
		if (kind === 'invalid-utf8') req.emit('data', Buffer.from([255]));
		if (kind === 'malformed') req.emit('data', Buffer.from('{"private":'));
		if (kind === 'array') req.emit('data', Buffer.from('[]'));
		req.emit('end');
		expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
		if (kind === 'valid') {
			expect(next).toHaveBeenCalledTimes(1);
			expect(req.body).toEqual({ scope: 'GLOBAL' });
		} else {
			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(
				kind === 'compressed'
					? 415
					: kind === 'chunked-overflow' || kind === 'content-length'
						? 413
						: 400,
			);
			expect(JSON.stringify(res.json.mock.calls)).not.toContain(
				'"private"',
			);
		}
	});
	it('should not replace parsers outside screening POST handling', () => {
		const next = jest.fn();
		screeningPrivacyMiddleware(
			{ method: 'GET' } as Request,
			{ setHeader: jest.fn() } as unknown as Response,
			next,
		);
		expect(next).toHaveBeenCalledTimes(1);
	});
});
