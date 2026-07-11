import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
	constructor(private readonly reflector: Reflector) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const response = context.switchToHttp().getResponse();

		const message =
			this.reflector.get<string>(
				'response_message',
				context.getHandler(),
			) ??
			'Success';

		return next.handle().pipe(
			map((data) => ({
				statusCode: response.statusCode,
				message: message,
				...(data !== null && data !== undefined ? { data } : {}),
			})),
		);
	}
}
