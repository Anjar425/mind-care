import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailTemplateRenderer } from './mail-template.renderer';
import { MAIL_TRANSPORT } from './mail-transport';
import {
	runtimeConfigMock,
	runtimeConfigProvider,
	syntheticConfig,
} from '../../test/runtime-config.mock';

jest.unmock('@/mail/mail.service');

describe('MailService configuration', () => {
	let module: TestingModule;
	let service: MailService;
	const sendMail = jest.fn();
	const close = jest.fn();
	beforeEach(async () => {
		sendMail.mockReset().mockResolvedValue(undefined);
		close.mockReset();
		module = await Test.createTestingModule({
			providers: [
				MailService,
				MailTemplateRenderer,
				runtimeConfigProvider,
				{ provide: MAIL_TRANSPORT, useValue: { sendMail, close } },
			],
		}).compile();
		service = module.get(MailService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should send from the configured sender address', async () => {
		await service.sendVerificationEmail(
			'test@example.test',
			'synthetic-token',
			'Example',
		);
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				from: 'test@example.test',
				to: 'test@example.test',
				subject: 'Verify Your Email - MindCare',
			}),
		);
	});
	it('should close the transport when the module shuts down', async () => {
		await module.close();
		expect(close).toHaveBeenCalledTimes(1);
		module = await Test.createTestingModule({
			providers: [
				MailService,
				MailTemplateRenderer,
				runtimeConfigProvider,
				{ provide: MAIL_TRANSPORT, useValue: { sendMail, close } },
			],
		}).compile();
	});
	it('should use the configured app URL when preparing verification mail', async () => {
		await service.sendVerificationEmail(
			'test@example.test',
			'synthetic-token',
			'Example',
		);
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				html: expect.stringContaining(
					'http://localhost:5173/auth/verify?token=synthetic-token',
				) as unknown,
			}),
		);
	});
	it('should use the configured app URL when preparing password reset mail', async () => {
		await service.sendPasswordResetEmail(
			'test@example.test',
			'synthetic-token',
			'Example',
		);
		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				html: expect.stringContaining(
					'http://localhost:5173/auth/reset-password?token=synthetic-token',
				) as unknown,
			}),
		);
	});
	it('should propagate delivery failure when the mocked transport rejects', async () => {
		sendMail.mockRejectedValue(new Error('synthetic-provider-failure'));
		await expect(
			service.sendVerificationEmail(
				'test@example.test',
				'synthetic-token',
				'Example',
			),
		).rejects.toThrow('synthetic-provider-failure');
	});
	it('should send an owner credential reminder without documents, numbers or screening results', async () => {
		await service.sendCredentialExpiryReminder(
			'synthetic@example.test',
			'STR',
			'2027-12-12',
		);
		expect(sendMail).toHaveBeenCalledWith({
			from: 'test@example.test',
			to: 'synthetic@example.test',
			subject: 'STR credential expiry reminder - MindCare',
			text: expect.stringContaining('2027-12-12') as unknown,
		});
		expect((sendMail.mock.calls as unknown[][])[0][0]).not.toHaveProperty(
			'attachments',
		);
	});
	it.each([
		['verification', 'sendVerificationEmail'],
		['password reset', 'sendPasswordResetEmail'],
	] as const)(
		'should escape a markup account name in %s mail',
		async (_, method) => {
			await service[method](
				'test@example.test',
				'synthetic-token',
				'<a href="https://evil.test">x</a>',
			);
			const { html } = (
				sendMail.mock.calls as [{ html: string }][]
			)[0][0];
			expect(html).toContain(
				'Hello &lt;a href=&quot;https://evil.test&quot;&gt;x&lt;/a&gt;,',
			);
			expect(html).not.toContain('<a href="https://evil.test">');
		},
	);
	describe('expiry wording', () => {
		const useExpiry = (minutes: number) =>
			runtimeConfigMock.get.mockImplementation(
				(key: keyof typeof syntheticConfig) =>
					key === 'VERIFICATION_TOKEN_EXPIRY_MINUTES' ||
					key === 'RESET_TOKEN_EXPIRY_MINUTES'
						? minutes
						: syntheticConfig[key],
			);
		afterEach(() =>
			runtimeConfigMock.get.mockImplementation(
				(key: keyof typeof syntheticConfig) => syntheticConfig[key],
			),
		);
		it.each([
			['sendVerificationEmail', 45, 'expire in 45 minutes.'],
			['sendPasswordResetEmail', 30, 'expire in 30 minutes.'],
			['sendVerificationEmail', 1, 'expire in 1 minute.'],
		] as const)(
			'%s should state the configured %i-minute expiry',
			async (method, minutes, expected) => {
				useExpiry(minutes);
				await service[method](
					'test@example.test',
					'synthetic-token',
					'Example',
				);
				const { html } = (
					sendMail.mock.calls as [{ html: string }][]
				)[0][0];
				expect(html).toContain(expected);
			},
		);
	});
});
