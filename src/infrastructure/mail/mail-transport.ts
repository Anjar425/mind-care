import { createTransport } from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import type { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../config/environment.config';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailMessage = SendMailOptions;
export type MailTransport = Pick<Transporter, 'sendMail' | 'close'>;

// Creating the transport does not open a connection; SMTP is contacted on send.
export function createMailTransport(
	config: ConfigService<RuntimeEnvironment, true>,
): MailTransport {
	return createTransport({
		host: config.get('MAIL_HOST', { infer: true }),
		port: config.get('MAIL_PORT', { infer: true }),
		secure: config.get('MAIL_SECURE', { infer: true }),
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 30000,
		auth: {
			user: config.get('MAIL_USER', { infer: true }),
			pass: config.get('MAIL_PASS', { infer: true }),
		},
	});
}
