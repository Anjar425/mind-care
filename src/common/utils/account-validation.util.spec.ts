import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginReqDto } from '@/auth/dto/req/login.req.dto';
import { RegisterReqDto } from '@/auth/dto/req/register.req.dto';
import { ResetPasswordReqDto } from '@/auth/dto/req/reset-password.req.dto';
import { EmailVerificationReqDto } from '@/auth/dto/req/email-verification.req.dto';
import { ForgotPasswordReqDto } from '@/auth/dto/req/forgot-password.req.dto';
import { VerifyAccountReqDto } from '@/auth/dto/req/verify-account.req.dto';
import {
	assertOpaqueToken,
	assertPassword,
	normalizeEmail,
} from './account-validation.util';

describe('Account validation', () => {
	afterEach(() => jest.clearAllMocks());

	it('should normalize identity when case and surrounding whitespace differ', () => {
		expect(normalizeEmail('  Budi@Mail.com  ')).toBe('budi@mail.com');
	});

	it.each([
		LoginReqDto,
		RegisterReqDto,
		EmailVerificationReqDto,
		ForgotPasswordReqDto,
	])(
		'should normalize email when an account DTO is transformed (%p)',
		(dto) => {
			const instance = plainToInstance(dto, {
				email: '  USER@Example.com ',
			});
			expect(instance.email).toBe('user@example.com');
		},
	);

	it.each(['Aa1' + 'x'.repeat(69), 'Aa1' + 'é'.repeat(34) + 'x'])(
		'should accept a password when its UTF-8 length is exactly 72 bytes (%p)',
		async (password) => {
			expect(Buffer.byteLength(password)).toBe(72);
			expect(() => assertPassword(password)).not.toThrow();
			for (const dto of [
				plainToInstance(RegisterReqDto, {
					name: 'Example',
					email: 'user@example.com',
					password,
					confirm_password: password,
				}),
				plainToInstance(ResetPasswordReqDto, {
					token: 'a'.repeat(64),
					newPassword: password,
				}),
			]) {
				expect(await validate(dto)).toHaveLength(0);
			}
		},
	);

	it.each([
		'Aa1' + 'x'.repeat(70),
		'Aa1' + 'é'.repeat(35),
		'short',
		'lowercase123',
		'UPPERCASE123',
		'NoDigitsHere',
	])(
		'should reject a password when registration or reset policy is violated (%p)',
		async (password) => {
			expect(() => assertPassword(password)).toThrow();
			const registration = await validate(
				plainToInstance(RegisterReqDto, {
					name: 'Example',
					email: 'user@example.com',
					password,
					confirm_password: password,
				}),
			);
			const reset = await validate(
				plainToInstance(ResetPasswordReqDto, {
					token: 'a'.repeat(64),
					newPassword: password,
				}),
			);
			expect(
				registration.some((error) => error.property === 'password'),
			).toBe(true);
			expect(
				reset.some((error) => error.property === 'newPassword'),
			).toBe(true);
		},
	);

	it('should reject role injection when public registration is validated', async () => {
		const pipe = new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		});
		await expect(
			pipe.transform(
				{
					name: 'Example',
					email: 'user@example.com',
					password: 'Passw0rd123',
					confirm_password: 'Passw0rd123',
					role: 'ADMIN',
				},
				{ type: 'body', metatype: RegisterReqDto },
			),
		).rejects.toThrow();
	});

	it('should reject a mismatched confirmation when registration is validated', async () => {
		const errors = await validate(
			plainToInstance(RegisterReqDto, {
				name: 'Example',
				email: 'user@example.com',
				password: 'Passw0rd123',
				confirm_password: 'OtherPass123',
			}),
		);
		expect(
			errors.some((error) => error.property === 'confirm_password'),
		).toBe(true);
	});

	it.each(['', 'x'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
		'should reject an opaque token when its format is invalid (%p)',
		async (token) => {
			expect(() => assertOpaqueToken(token)).toThrow();
			expect(
				await validate(plainToInstance(VerifyAccountReqDto, { token })),
			).not.toHaveLength(0);
		},
	);

	it('should reject non-string fields when account input types are invalid', async () => {
		const errors = await validate(
			plainToInstance(LoginReqDto, { email: 123, password: 123 }),
		);
		expect(errors).toHaveLength(2);
	});
});
