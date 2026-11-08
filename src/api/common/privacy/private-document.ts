import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

// Streams a private credential document as a non-cacheable attachment.
export function privateDocument(
	result: { bytes: Buffer; mime: string; filename: string },
	res: Response,
) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('X-Content-Type-Options', 'nosniff');
	return new StreamableFile(result.bytes, {
		type: result.mime,
		disposition: `attachment; filename="${result.filename}"`,
	});
}
