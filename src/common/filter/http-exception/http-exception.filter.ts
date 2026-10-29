import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DEFAULT_MESSAGE } from '../../constant/default-message.constant';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<Response>();
		const candidate =
			exception instanceof HttpException ? exception.getStatus() : 500;
		const status =
			Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
				? candidate
				: 500;
		if (status >= 500) {
			// No exception, stack, URL, request body or submitted value is logged.
			this.logger.error('API request failed');
			response.status(status);
			response.json({
				statusCode: status,
				message: ['Internal server error'],
				error:
					DEFAULT_MESSAGE[status]?.error ??
					HttpStatus[status] ??
					'Server Error',
			});
			return;
		}
		const body: unknown =
			exception instanceof HttpException ? exception.getResponse() : null;
		let message = ['Request rejected'];
		let error =
			DEFAULT_MESSAGE[status]?.error ??
			HttpStatus[status] ??
			'Request Error';
		if (typeof body === 'string') message = [body];
		else if (typeof body === 'object' && body !== null) {
			if ('message' in body) {
				if (typeof body.message === 'string') message = [body.message];
				else if (Array.isArray(body.message)) {
					const entries = body.message.filter(
						(item: unknown): item is string =>
							typeof item === 'string',
					);
					if (entries.length) message = entries;
				}
			}
			if ('error' in body && typeof body.error === 'string')
				error = body.error;
		}
		if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
		// Nest's route-miss text can contain the URL/query, including opaque tokens.
		if (status === 404) {
			message = message.map((entry) =>
				/^Cannot (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s/.test(
					entry,
				)
					? 'Resource not found'
					: entry,
			);
		}
		response.status(status).json({ statusCode: status, message, error });
	}
}
