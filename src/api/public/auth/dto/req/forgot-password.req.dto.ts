import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from '@/domain/identity/account-validation.util';

export class ForgotPasswordReqDto {
	@ApiProperty({
		description: 'Email identity, trimmed and lowercased',
		example: 'user@example.com',
	})
	@NormalizeEmail()
	@IsEmail()
	email!: string;
}
