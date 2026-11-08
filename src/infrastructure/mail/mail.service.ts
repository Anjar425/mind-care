import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../config/environment.config';
import { MailTemplateRenderer } from './mail-template.renderer';
import {
	MAIL_TRANSPORT,
	type MailMessage,
	type MailTransport,
} from './mail-transport';
import { metrics } from '../observability/metrics';

function formatMinutes(minutes: number): string {
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

@Injectable()
export class MailService implements OnModuleDestroy {
	constructor(
		@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
		private readonly templates: MailTemplateRenderer,
	) {}

	onModuleDestroy(): void {
		this.transport.close();
	}

	async sendCredentialExpiryReminder(
		email: string,
		type: 'STR' | 'SIP',
		expiryDate: string,
	): Promise<void> {
		await this.send({
			to: email,
			subject: `${type} credential expiry reminder - MindCare`,
			text: `Your ${type} credential is valid through ${expiryDate} (Asia/Jakarta). Submit a renewal for review before expiry to maintain contribution eligibility. This message does not contain screening results.`,
		});
	}

	async sendVerificationEmail(
		email: string,
		token: string,
		firstName: string,
	): Promise<void> {
		const html = this.templates.render('verify-email', {
			firstName,
			actionUrl: `${this.config.get('FRONTEND_URL', { infer: true })}/auth/verify?token=${token}`,
			expiry: formatMinutes(
				this.config.get('VERIFICATION_TOKEN_EXPIRY_MINUTES', {
					infer: true,
				}),
			),
			year: String(new Date().getFullYear()),
		});

		await this.send({
			to: email,
			subject: 'Verify Your Email - MindCare',
			html,
		});
	}

	async sendPasswordResetEmail(
		email: string,
		token: string,
		firstName: string,
	): Promise<void> {
		const html = this.templates.render('reset-password', {
			firstName,
			actionUrl: `${this.config.get('FRONTEND_URL', { infer: true })}/auth/reset-password?token=${token}`,
			expiry: formatMinutes(
				this.config.get('RESET_TOKEN_EXPIRY_MINUTES', { infer: true }),
			),
			year: String(new Date().getFullYear()),
		});

		await this.send({
			to: email,
			subject: 'Reset Your Password - MindCare',
			html,
		});
	}

	private async send(message: Omit<MailMessage, 'from'>): Promise<void> {
		try {
			await this.transport.sendMail({
				from: this.config.get('MAIL_FROM', { infer: true }),
				...message,
			});
		} catch (error) {
			metrics.emailSendFailures.inc();
			throw error;
		}
	}
}
