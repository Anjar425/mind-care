import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { HttpExceptionFilter } from '../common/filter/http-exception/http-exception.filter';
@Catch()
export class HistoryExceptionFilter implements ExceptionFilter {
	catch(error: unknown, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>();
		response.setHeader('Cache-Control', 'no-store');
		const status = error instanceof HttpException ? error.getStatus() : 500;
		if (status >= 500 || status < 400)
			return new HttpExceptionFilter().catch(error, host);
		const messages: Record<number, string> = {
			400: 'Invalid history request',
			401: 'Authentication required',
			403: 'History access denied',
			404: 'Private history resource not found',
			409: 'History state changed or storage is unavailable for this request; reload before retrying',
			413: 'History request exceeds capacity',
			429: 'Too many requests',
		};
		if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
		response.status(status).json({
			statusCode: status,
			message: [messages[status] ?? 'History request rejected'],
			error: 'History request rejected',
		});
	}
}
