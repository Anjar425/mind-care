import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import { MailerService } from '@nestjs-modules/mailer';
import { MailTemplateRenderer } from './mail-template.renderer';

function formatMinutes(minutes: number): string {
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

@Injectable()
export class MailService {
	constructor(
		private readonly mailerService: MailerService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
		private readonly templates: MailTemplateRenderer,
	) {}

	async sendCredentialExpiryReminder(
		email: string,
		type: 'STR' | 'SIP',
		expiryDate: string,
	): Promise<void> {
		await this.mailerService.sendMail({
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

		await this.mailerService.sendMail({
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

		await this.mailerService.sendMail({
			to: email,
			subject: 'Reset Your Password - MindCare',
			html,
		});
	}
}
