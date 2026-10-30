import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';
import { runtimeConfigProvider } from '../../test/runtime-config.mock';

jest.unmock('@/mail/mail.service');

describe('MailService configuration', () => {
	let module: TestingModule;
	let service: MailService;
	const sendMail = jest.fn();
	beforeEach(async () => {
		sendMail.mockReset().mockResolvedValue(undefined);
		module = await Test.createTestingModule({
			providers: [
				MailService,
				runtimeConfigProvider,
				{ provide: MailerService, useValue: { sendMail } },
			],
		}).compile();
		service = module.get(MailService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
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
			to: 'synthetic@example.test',
			subject: 'STR credential expiry reminder - MindCare',
			text: expect.stringContaining('2027-12-12') as unknown,
		});
		expect((sendMail.mock.calls as unknown[][])[0][0]).not.toHaveProperty(
			'attachments',
		);
	});
});
