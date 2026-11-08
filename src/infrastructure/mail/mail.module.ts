import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../config/environment.config';
import { MailService } from './mail.service';
import { MailTemplateRenderer } from './mail-template.renderer';
import { MAIL_TRANSPORT, createMailTransport } from './mail-transport';

@Module({
	providers: [
		{
			provide: MAIL_TRANSPORT,
			inject: [ConfigService],
			useFactory: (config: ConfigService<RuntimeEnvironment, true>) =>
				createMailTransport(config),
		},
		MailService,
		MailTemplateRenderer,
	],
	exports: [MailService],
})
export class MailModule {}
