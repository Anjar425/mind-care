import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DEFAULT_MESSAGE } from './default-messages';
import { REDACTION_POLICIES, type ErrorPolicyName } from './error-policies';

interface ErrorBody {
	statusCode: number;
	message: string[];
	error: string;
}

/**
 * The only exception filter. Renders `{ statusCode, message[], error }` and never exposes
 * stacks, URLs, request bodies or submitted values. Registered globally without a policy;
 * `@ErrorPolicy(...)` binds a controller-scoped instance with one.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(GlobalExceptionFilter.name);

	constructor(private readonly policy?: ErrorPolicyName) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<Response>();
		const policy = this.policy;
		if (policy === 'auth') return this.renderAuth(exception, response);
		if (policy === 'history' || policy === 'screening') {
			response.setHeader('Cache-Control', 'no-store');
			const status =
				exception instanceof HttpException
					? exception.getStatus()
					: 500;
			if (status >= 400 && status < 500) {
				const redaction = REDACTION_POLICIES[policy];
				if (status === 401)
					response.setHeader('WWW-Authenticate', 'Bearer');
				return send(response, {
					statusCode: status,
					message: [redaction.messages[status] ?? redaction.fallback],
					error: redaction.error,
				});
			}
		}
		this.renderDefault(exception, response);
	}

	private renderDefault(exception: unknown, response: Response): void {
		const candidate =
			exception instanceof HttpException ? exception.getStatus() : 500;
		const status =
			Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
				? candidate
				: 500;
		if (status >= 500) {
			// No exception, stack, URL, request body or submitted value is logged.
			this.logger.error('API request failed');
			return send(response, {
				statusCode: status,
				message: ['Internal server error'],
				error:
					DEFAULT_MESSAGE[status]?.error ??
					HttpStatus[status] ??
					'Server Error',
			});
		}
		const parsed = parseHttpBody(exception, status, 'default');
		if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
		// Nest's route-miss text can contain the URL/query, including opaque tokens.
		if (status === 404)
			parsed.message = parsed.message.map((entry) =>
				/^Cannot (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s/.test(
					entry,
				)
					? 'Resource not found'
					: entry,
			);
		send(response, { statusCode: status, ...parsed });
	}

	private renderAuth(exception: unknown, response: Response): void {
		const status =
			exception instanceof HttpException ? exception.getStatus() : 500;
		if (status >= 500) {
			this.logger.error('Authentication request failed');
			return send(response, {
				statusCode: 500,
				message: ['Internal server error'],
				error: 'Internal Server Error',
			});
		}
		const parsed = parseHttpBody(exception, status, 'auth');
		if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
		send(response, { statusCode: status, ...parsed });
	}
}

function parseHttpBody(
	exception: unknown,
	status: number,
	rendering: 'default' | 'auth',
): Omit<ErrorBody, 'statusCode'> {
	const body: unknown =
		exception instanceof HttpException ? exception.getResponse() : null;
	let message = ['Request rejected'];
	let error =
		DEFAULT_MESSAGE[status]?.error ??
		(rendering === 'default' ? HttpStatus[status] : undefined) ??
		'Request Error';
	if (typeof body === 'string') message = [body];
	else if (typeof body === 'object' && body !== null) {
		if ('message' in body) {
			if (typeof body.message === 'string') message = [body.message];
			else if (Array.isArray(body.message)) {
				const entries = body.message.filter(
					(item: unknown): item is string => typeof item === 'string',
				);
				// The auth rendering has always returned an empty list unchanged.
				if (entries.length || rendering === 'auth') message = entries;
			}
		}
		if ('error' in body && typeof body.error === 'string')
			error = body.error;
	}
	return { message, error };
}

function send(response: Response, body: ErrorBody): void {
	response.status(body.statusCode).json(body);
}
