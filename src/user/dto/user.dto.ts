import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsNotEmpty,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';
import {
	NormalizeEmail,
	PasswordPolicy,
} from '@/common/utils/account-validation.util';

export class UserDto {
	@ApiProperty({
		description: 'Email identity, trimmed and lowercased',
		example: 'user@example.com',
	})
	@NormalizeEmail()
	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@ApiProperty({
		description: 'Registered account name',
		example: 'User',
		minLength: 2,
		maxLength: 100,
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	name!: string;

	@ApiProperty({
		description:
			'At least 8 characters with uppercase, lowercase and a number; maximum 72 UTF-8 bytes',
		example: 'Passw0rd123',
		minLength: 8,
		maxLength: 72,
	})
	@PasswordPolicy()
	password!: string;
}
