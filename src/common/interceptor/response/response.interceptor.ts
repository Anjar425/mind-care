import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
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
	ResponseEnvelope<T>
> {
	constructor(private readonly reflector: Reflector) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler<T>,
	): Observable<ResponseEnvelope<T>> {
		const response = context.switchToHttp().getResponse<Response>();

		const metadata = this.reflector.get<unknown>(
			'response_message',
			context.getHandler(),
		);
		const message = typeof metadata === 'string' ? metadata : 'Success';

		return next.handle().pipe(
			map((data) => ({
				statusCode: response.statusCode,
				message: message,
				...(data !== null && data !== undefined ? { data } : {}),
			})),
		);
	}
}
