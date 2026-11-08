import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import type { SecurityEventType } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { metrics } from '../../infrastructure/observability/metrics';
import { requestContext } from '../../infrastructure/observability/request-context';

export interface SecurityEventInput {
	/** Who performed the action (an admin reviewing, or the user themself). */
	actorUserId?: string;
	/** Whose account or session the event is about. */
	subjectUserId?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Append-only security audit. Recording is best effort: it never throws and never runs inside
 * the caller's transaction, so neither a failed write nor a rolled-back business change can
 * affect the other. Request id, client IP (HMAC) and user-agent family come from the request
 * context; nothing personal is stored in clear.
 */
@Injectable()
export class SecurityEventService {
	private readonly logger = new Logger(SecurityEventService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}

	async record(
		type: SecurityEventType,
		input: SecurityEventInput = {},
	): Promise<void> {
		const context = requestContext.current();
		try {
			await this.prisma.securityEvent.create({
				data: {
					type,
					actorUserId: input.actorUserId ?? null,
					subjectUserId: input.subjectUserId ?? null,
					ipHash: context?.ip ? this.hash(context.ip) : null,
					userAgentFamily: userAgentFamily(context?.userAgent),
					requestId: context?.requestId ?? null,
				},
			});
			metrics.securityEvents.inc({ type, stored: 'true' });
		} catch {
			metrics.securityEvents.inc({ type, stored: 'false' });
			this.logger.warn('Security event could not be stored');
		}
	}

	/** Deletes events older than SECURITY_EVENT_RETENTION_DAYS. Returns the number removed. */
	async purgeExpired(now = new Date()): Promise<number> {
		const days = this.config.get('SECURITY_EVENT_RETENTION_DAYS', {
			infer: true,
		});
		const { count } = await this.prisma.securityEvent.deleteMany({
			where: {
				createdAt: { lt: new Date(now.getTime() - days * DAY_MS) },
			},
		});
		return count;
	}

	private hash(ip: string): string {
		// Keyed so stored hashes cannot be reversed by enumerating the IPv4 space.
		const key = this.config.get('CREDENTIAL_LOOKUP_KEY', { infer: true });
		return createHmac('sha256', Buffer.from(key, 'hex'))
			.update(`ip:${ip}`)
			.digest('hex');
	}
}

export function userAgentFamily(userAgent: string | undefined): string | null {
	if (!userAgent) return null;
	if (/\b(Mobi|Android|iPhone|iPad)\b/i.test(userAgent)) return 'mobile';
	if (
		/\b(curl|wget|httpie|python|node|go-http|java|okhttp|postman)\b/i.test(
			userAgent,
		)
	)
		return 'cli';
	if (/\b(Mozilla|Chrome|Safari|Firefox|Edg|Opera)\b/i.test(userAgent))
		return 'browser';
	return 'other';
}
