import { IsHexadecimal, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PasswordPolicy } from '@/common/utils/account-validation.util';

export class ResetPasswordReqDto {
	@ApiProperty({
		description: 'Opaque password reset token from email',
		example: 'a'.repeat(64),
		minLength: 64,
		maxLength: 64,
	})
	@IsString()
	@IsHexadecimal()
	@Length(64, 64)
	token!: string;

	@ApiProperty({
		description:
			'Same password policy as registration; maximum 72 UTF-8 bytes',
		example: 'Passw0rd123',
		minLength: 8,
		maxLength: 72,
	})
	@PasswordPolicy()
	newPassword!: string;
}
