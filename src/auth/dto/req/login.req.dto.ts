import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from '@/common/utils/account-validation.util';

export class LoginReqDto {
	@ApiProperty({
		description: 'Email identity, trimmed and lowercased',
		example: 'user@example.com',
	})
	@NormalizeEmail()
	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@ApiProperty({
		description: 'Account password, maximum 72 UTF-8 bytes',
		example: 'Passw0rd123',
		maxLength: 72,
	})
	@IsByteLength(1, 72, { message: 'password must not exceed 72 UTF-8 bytes' })
	@IsNotEmpty()
	@IsString()
	password!: string;
}
