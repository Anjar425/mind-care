import { createTransport } from 'nodemailer';
import { createMailTransport } from './mail-transport';
import { runtimeConfigMock } from '../../test/runtime-config.mock';
import type { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';

jest.mock('nodemailer', () => ({
	createTransport: jest.fn(() => ({ sendMail: jest.fn(), close: jest.fn() })),
}));

describe('createMailTransport', () => {
	it('should build an SMTP transport from validated settings with bounded timeouts', () => {
		createMailTransport(
			runtimeConfigMock as unknown as ConfigService<
				RuntimeEnvironment,
				true
			>,
		);
		expect(createTransport).toHaveBeenCalledWith({
			host: 'smtp.example.test',
			port: 587,
			secure: false,
			connectionTimeout: 10000,
			greetingTimeout: 10000,
			socketTimeout: 30000,
			auth: { user: 'synthetic', pass: 'synthetic' },
		});
	});
});
