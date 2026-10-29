import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from '@/common/utils/account-validation.util';

export class EmailVerificationReqDto {
	@ApiProperty({
		description: 'Email identity, trimmed and lowercased',
		example: 'expert@example.com',
	})
	@NormalizeEmail()
	@IsEmail()
	email!: string;
}
