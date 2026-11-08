import {
	ExecutionContext,
	Inject,
	Injectable,
	CanActivate,
} from '@nestjs/common';
import { ThrottlerStorage, ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { RuntimeEnvironment } from '../../../infrastructure/config/environment.config';
import {
	RATE_LIMIT_ACTION,
	RATE_LIMIT_ACTIONS,
	type RateLimitAction,
} from './rate-limit.decorator';

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
	constructor(
		@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
		private readonly reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const http = context.switchToHttp();
		const req = http.getRequest<Request>();
		const res = http.getResponse<Response>();
		// req.ip is the socket peer unless TRUST_PROXY_HOPS lets Express read X-Forwarded-For.
		const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
		await this.consume(
			ip,
			'general',
			this.config.get('RATE_LIMIT_GENERAL', { infer: true }),
			res,
		);
		const action = this.reflector.get<RateLimitAction | undefined>(
			RATE_LIMIT_ACTION,
			context.getHandler(),
		);
		if (action)
			await this.consume(
				ip,
				action,
				this.config.get(RATE_LIMIT_ACTIONS[action], { infer: true }),
				res,
			);
		return true;
	}

	private async consume(
		ip: string,
		name: string,
		limit: number,
		response: Response,
	): Promise<void> {
		const key = createHash('sha256').update(`${name}:${ip}`).digest('hex');
		const windowMs = this.config.get('RATE_LIMIT_WINDOW_MS', {
			infer: true,
		});
		const result = await this.storage.increment(
			key,
			windowMs,
			limit,
			windowMs,
			name,
		);
		response.setHeader(`X-RateLimit-Limit-${name}`, limit);
		response.setHeader(
			`X-RateLimit-Remaining-${name}`,
			Math.max(0, limit - result.totalHits),
		);
		if (result.isBlocked) {
			response.setHeader('Retry-After', result.timeToBlockExpire);
			throw new ThrottlerException('Too many requests');
		}
	}
}
