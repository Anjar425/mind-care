import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { HttpExceptionFilter } from '../common/filter/http-exception/http-exception.filter';
@Catch()
export class ScreeningExceptionFilter implements ExceptionFilter {
	catch(error: unknown, host: ArgumentsHost) {
		const res = host.switchToHttp().getResponse<Response>();
		res.setHeader('Cache-Control', 'no-store');
		const status = error instanceof HttpException ? error.getStatus() : 500;
		if (status >= 500 || status < 400)
			return new HttpExceptionFilter().catch(error, host);
		const messages: Record<number, string> = {
			400: 'Invalid screening request',
			401: 'Authentication required; supplied credentials were not accepted',
			403: 'Personal screening role required',
			404: 'Screening source unavailable',
			409: 'Screening catalog or source is not ready; reload or select an available source',
			413: 'Screening request exceeds capacity',
			415: 'Uncompressed UTF-8 JSON is required',
			429: 'Too many requests',
		};
		if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
		res.status(status).json({
			statusCode: status,
			message: [messages[status] ?? 'Screening request rejected'],
			error: 'Screening request rejected',
		});
	}
}
