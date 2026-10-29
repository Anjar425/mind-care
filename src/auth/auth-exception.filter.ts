import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(AuthExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<Response>();
		const status =
			exception instanceof HttpException ? exception.getStatus() : 500;
		if (status >= 500) {
			this.logger.error('Authentication request failed');
			response.status(500);
			response.json({
				statusCode: 500,
				message: ['Internal server error'],
				error: 'Internal Server Error',
			});
			return;
		}
		const body: unknown =
			exception instanceof HttpException ? exception.getResponse() : null;
		let message = ['Request rejected'];
		let error = 'Request Error';
		if (typeof body === 'string') message = [body];
		else if (typeof body === 'object' && body !== null) {
			if ('message' in body) {
				if (typeof body.message === 'string') message = [body.message];
				else if (Array.isArray(body.message))
					message = body.message.filter(
						(item: unknown): item is string =>
							typeof item === 'string',
					);
			}
			if ('error' in body && typeof body.error === 'string')
				error = body.error;
		}
		if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
		response.status(status).json({ statusCode: status, message, error });
	}
}
