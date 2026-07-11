import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter<T> implements ExceptionFilter {
	catch(exception: HttpException, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const status = exception.getStatus();
		const exceptionResponse = exception.getResponse();

		let message: string[] = [];
		let error: string = HttpStatus[status] as unknown as string;

		if (typeof exceptionResponse === 'string') {
			message = [exceptionResponse];
			error = exception.name.replace('Exception', '');
		} else if (exceptionResponse && typeof exceptionResponse === 'object') {
			const res = exceptionResponse as {
				message: string | string[];
				error?: string;
			};
			message = Array.isArray(res.message) ? res.message : [res.message];
			error = res.error ?? HttpStatus[status];
		}

		response.status(status).json({
			statusCode: status,
			message,
			error,
		});
	}
}
