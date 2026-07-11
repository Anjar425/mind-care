import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
	constructor(private readonly mailerService: MailerService) {}

	async sendVerificationEmail(
		email: string,
		token: string,
		firstName: string,
	): Promise<void> {
		const verificationUrl = `${process.env.APP_URL}/auth/verify?token=${token}`;
		const htmlContent = this.getVerificationEmailTemplate(
			firstName,
			verificationUrl,
		);

		await this.mailerService.sendMail({
			to: email,
			subject: 'Verify Your Email - MindCare',
			html: htmlContent,
		});
	}

	async sendPasswordResetEmail(
		email: string,
		token: string,
		firstName: string,
	): Promise<void> {
		const resetUrl = `${process.env.APP_URL}/auth/reset-password?token=${token}`;
		const htmlContent = this.getPasswordResetEmailTemplate(
			firstName,
			resetUrl,
		);

		await this.mailerService.sendMail({
			to: email,
			subject: 'Reset Your Password - MindCare',
			html: htmlContent,
		});
	}

	private getVerificationEmailTemplate(
		firstName: string,
		verificationUrl: string,
	): string {
		return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f4; }
    .content { background: white; padding: 30px; border-radius: 5px; }
    .header { text-align: center; margin-bottom: 30px; }
    .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <div class="header">
        <h2>Email Verification</h2>
      </div>
      <p>Hello ${firstName},</p>
      <p>Thank you for signing up for MindCare! Please verify your email address to activate your account.</p>
      <a href="${verificationUrl}" class="button">Verify Email</a>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${verificationUrl}</code></p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you did not create this account, please ignore this email.</p>
      <div class="footer">
        <p>&copy; 2024 MindCare. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
		`;
	}

	private getPasswordResetEmailTemplate(
		firstName: string,
		resetUrl: string,
	): string {
		return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f4; }
    .content { background: white; padding: 30px; border-radius: 5px; }
    .header { text-align: center; margin-bottom: 30px; }
    .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <div class="header">
        <h2>Password Reset Request</h2>
      </div>
      <p>Hello ${firstName},</p>
      <p>We received a request to reset your password. Click the button below to set a new password.</p>
      <a href="${resetUrl}" class="button">Reset Password</a>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${resetUrl}</code></p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you did not request a password reset, please ignore this email.</p>
      <div class="footer">
        <p>&copy; 2024 MindCare. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
		`;
	}
}
