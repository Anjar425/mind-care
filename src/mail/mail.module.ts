import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

@Module({
	imports: [
		MailerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) => ({
				transport: {
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
				},
				defaults: {
					from: config.get('MAIL_FROM', { infer: true }),
				},
			}),
		}),
	],
	providers: [MailService],
	exports: [MailService],
})
export class MailModule {}
