import type { NextFunction, Request, Response } from 'express';
import { errorCodeFor } from '../errors/error-policies';
import { MAX_SCREENING_REQUEST_BYTES } from '../../../shared/contracts/screening';
// Early feature-scoped stream bound. No new Express runtime dependency or global parser override.
export function screeningPrivacyMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');
	if (req.method !== 'POST') {
		next();
		return;
	}
	let finished = false;
	const reject = (status: number) => {
		if (finished) return;
		finished = true;
		res.status(status).json({
			statusCode: status,
			code: errorCodeFor(status, 'screening'),
			message: [
				status === 413
					? 'Screening request exceeds capacity'
					: 'Invalid screening JSON request',
			],
			error: 'Screening request rejected',
		});
	};
	if (
		!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
			req.headers['content-type'] ?? '',
		) ||
		(req.headers['content-encoding'] &&
			req.headers['content-encoding'] !== 'identity')
	) {
		reject(415);
		req.resume();
		return;
	}
	if (
		Number(req.headers['content-length'] ?? 0) > MAX_SCREENING_REQUEST_BYTES
	) {
		reject(413);
		req.resume();
		return;
	}
	const chunks: Buffer[] = [];
	let length = 0;
	req.on('data', (chunk: unknown) => {
		if (finished) return;
		if (!Buffer.isBuffer(chunk)) {
			reject(400);
			return;
		}
		length += chunk.length;
		if (length > MAX_SCREENING_REQUEST_BYTES) {
			chunks.length = 0;
			reject(413);
			return;
		}
		chunks.push(chunk);
	});
	req.on('error', () => reject(400));
	req.on('aborted', () => reject(400));
	req.on('end', () => {
		if (finished) return;
		try {
			const body: unknown = JSON.parse(
				new TextDecoder('utf-8', { fatal: true }).decode(
					Buffer.concat(chunks),
				),
			);
			if (!body || typeof body !== 'object' || Array.isArray(body)) {
				reject(400);
				return;
			}
			req.body = body;
		} catch {
			reject(400);
			return;
		}
		chunks.length = 0;
		finished = true;
		next();
	});
}
