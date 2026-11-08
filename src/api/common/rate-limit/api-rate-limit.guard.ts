import {
	ExecutionContext,
	Inject,
	Injectable,
	CanActivate,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerStorage, ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { RuntimeEnvironment } from '../../../infrastructure/config/environment.config';
import { normalizeEmail } from '../../../domain/identity/account-validation.util';
import {
	RATE_LIMIT_ACTION,
	RATE_LIMIT_ACTIONS,
	type RateLimitAction,
	type RateLimitPolicy,
} from './rate-limit.decorator';

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
	private readonly logger = new Logger(ApiRateLimitGuard.name);

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
			false,
		);
		const action = this.reflector.get<RateLimitAction | undefined>(
			RATE_LIMIT_ACTION,
			context.getHandler(),
		);
		if (!action) return true;
		const policy: RateLimitPolicy = RATE_LIMIT_ACTIONS[action];
		await this.consume(
			ip,
			action,
			this.config.get(policy.limit, { infer: true }),
			res,
			policy.failClosed,
		);
		// Second counter per submitted email, so one account cannot be attacked from many IPs.
		// Any string counts (existing or not), so the limit reveals nothing about accounts.
		const email = accountOf(req.body);
		if (policy.account && email)
			await this.consume(
				email,
				`${action}-account`,
				this.config.get(policy.account, { infer: true }),
				res,
				policy.failClosed,
			);
		return true;
	}

	private async consume(
		subject: string,
		name: string,
		limit: number,
		response: Response,
		failClosed: boolean,
	): Promise<void> {
		const key = createHash('sha256')
			.update(`${name}:${subject}`)
			.digest('hex');
		const windowMs = this.config.get('RATE_LIMIT_WINDOW_MS', {
			infer: true,
		});
		let result: Awaited<ReturnType<ThrottlerStorage['increment']>>;
		try {
			result = await this.storage.increment(
				key,
				windowMs,
				limit,
				windowMs,
				name,
			);
		} catch {
			// No key, IP or email is logged.
			this.logger.warn('Rate-limit store unavailable');
			if (failClosed)
				throw new ServiceUnavailableException(
					'Request temporarily unavailable; retry later',
				);
			return;
		}
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

function accountOf(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null || !('email' in body))
		return undefined;
	const { email } = body;
	if (typeof email !== 'string') return undefined;
	const normalized = normalizeEmail(email);
	return normalized.length > 0 && normalized.length <= 320
		? normalized
		: undefined;
}
