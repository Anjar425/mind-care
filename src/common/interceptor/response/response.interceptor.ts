import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RESPONSE_MESSAGE } from '../../decorator/response/response.decorator';
import { DEFAULT_RESPONSE_MESSAGES } from '@/common/constant/response.constant';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
	constructor(private readonly reflector: Reflector) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const response = context.switchToHttp().getResponse();

		const message =
			this.reflector.get<string>(
				RESPONSE_MESSAGE,
				context.getHandler(),
			) ??
			DEFAULT_RESPONSE_MESSAGES[response.statusCode] ??
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
