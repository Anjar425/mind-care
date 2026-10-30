import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
	StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import type { Response } from 'express';

export interface ResponseEnvelope<T> {
	statusCode: number;
	message: string;
	data?: T;
}

@Injectable()
export class ResponseInterceptor<T = unknown> implements NestInterceptor<
	T,
	ResponseEnvelope<T> | StreamableFile
> {
	constructor(private readonly reflector: Reflector) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler<T>,
	): Observable<ResponseEnvelope<T> | StreamableFile> {
		const response = context.switchToHttp().getResponse<Response>();

		const metadata = this.reflector.get<unknown>(
			'response_message',
			context.getHandler(),
		);
		const message = typeof metadata === 'string' ? metadata : 'Success';

		return next.handle().pipe(
			map((data) =>
				data instanceof StreamableFile
					? data
					: {
							statusCode: response.statusCode,
							message: message,
							...(data !== null && data !== undefined
								? { data }
								: {}),
						},
			),
		);
	}
}
