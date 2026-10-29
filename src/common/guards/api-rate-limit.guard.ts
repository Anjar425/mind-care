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
import type { RuntimeEnvironment } from '../config/environment.config';

type ActionLimit =
	| 'RATE_LIMIT_LOGIN'
	| 'RATE_LIMIT_REGISTER'
	| 'RATE_LIMIT_FORGOT_PASSWORD'
	| 'RATE_LIMIT_SEND_VERIFICATION'
	| 'RATE_LIMIT_REFRESH';
const ACTIONS: Record<string, { name: string; setting: ActionLimit }> = {
	'/auth/login': { name: 'login', setting: 'RATE_LIMIT_LOGIN' },
	'/auth/expert/login': { name: 'login', setting: 'RATE_LIMIT_LOGIN' },
	'/auth/admin/login': { name: 'login', setting: 'RATE_LIMIT_LOGIN' },
	'/auth/user/register': { name: 'register', setting: 'RATE_LIMIT_REGISTER' },
	'/auth/expert/register': {
		name: 'register',
		setting: 'RATE_LIMIT_REGISTER',
	},
	'/auth/forgot-password': {
		name: 'forgot',
		setting: 'RATE_LIMIT_FORGOT_PASSWORD',
	},
	'/auth/send-verification': {
		name: 'verification',
		setting: 'RATE_LIMIT_SEND_VERIFICATION',
	},
	'/auth/refresh': { name: 'refresh', setting: 'RATE_LIMIT_REFRESH' },
};

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
	constructor(
		@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const http = context.switchToHttp();
		const req = http.getRequest<Request>();
		const res = http.getResponse<Response>();
		// Use the socket peer: no forwarded header is trusted by this local policy.
		const ip = req.socket.remoteAddress ?? 'unknown';
		await this.consume(
			ip,
			'general',
			this.config.get('RATE_LIMIT_GENERAL', { infer: true }),
			res,
		);
		// Express's matched template is canonical even for case/trailing-slash variants.
		const route: unknown = req.route;
		const path =
			typeof route === 'object' &&
			route !== null &&
			'path' in route &&
			typeof route.path === 'string'
				? route.path
				: '';
		const action = req.method === 'POST' ? ACTIONS[path] : undefined;
		if (action)
			await this.consume(
				ip,
				action.name,
				this.config.get(action.setting, { infer: true }),
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
