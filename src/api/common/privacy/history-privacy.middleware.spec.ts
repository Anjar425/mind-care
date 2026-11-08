import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { historyPrivacyMiddleware } from './history-privacy.middleware';
describe('Early private history middleware', () => {
	it.each(['oversized', 'utf8', 'compressed', 'array', 'valid'])(
		'should enforce bounded JSON streaming for %s bodies',
		(kind) => {
			const req = Object.assign(new EventEmitter(), {
				method: 'PUT',
				headers: {
					'content-type': 'application/json',
					...(kind === 'compressed'
						? { 'content-encoding': 'gzip' }
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
			historyPrivacyMiddleware(
				req as unknown as Request,
				res as unknown as Response,
				next,
			);
			if (kind === 'oversized') {
				req.emit('data', Buffer.alloc(24000));
				req.emit('data', Buffer.alloc(26000));
			}
			if (kind === 'utf8') req.emit('data', Buffer.from([0xff]));
			if (kind === 'array') req.emit('data', Buffer.from('[]'));
			if (kind === 'valid')
				req.emit('data', Buffer.from('{"expectedVaultRevision":1}'));
			req.emit('end');
			if (kind === 'valid') {
				expect(next).toHaveBeenCalledTimes(1);
				expect(req.body).toEqual({ expectedVaultRevision: 1 });
			} else {
				expect(next).not.toHaveBeenCalled();
				expect(res.status).toHaveBeenCalledWith(
					kind === 'oversized'
						? 413
						: kind === 'compressed'
							? 415
							: 400,
				);
			}
		},
	);
	it('should mark responses private before authentication or validation', () => {
		const response = { setHeader: jest.fn() };
		const next = jest.fn();
		historyPrivacyMiddleware(
			{ method: 'GET', headers: {} } as Request,
			response as unknown as Response,
			next,
		);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Cache-Control',
			'no-store',
		);
		expect(next).toHaveBeenCalledTimes(1);
	});
});
