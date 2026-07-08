import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

@Module({
	imports: [
		MailerModule.forRoot({
			transport: {
				host: process.env.MAIL_HOST || 'smtp.gmail.com',
				port: parseInt(process.env.MAIL_PORT || '587'),
				secure: process.env.MAIL_SECURE === 'true',
				auth: {
					user: process.env.MAIL_USER,
					pass: process.env.MAIL_PASS,
				},
			},
			defaults: {
				from: process.env.MAIL_FROM || '"MindCare" <noreply@mindcare.com>',
			},
		}),
	],
	providers: [MailService],
	exports: [MailService],
})
export class MailModule {}
