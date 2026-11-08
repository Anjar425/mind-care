import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsNotEmpty,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from 'class-validator';
import {
	NormalizeEmail,
	PasswordPolicy,
} from '@/domain/identity/account-validation.util';

// Names reach HTML email; keep titles/punctuation needed for STR/SIP holder matching.
export const ACCOUNT_NAME_PATTERN = /^(?=.*\p{L})[^<>&"`\\/\p{Cc}\p{Cf}]+$/u;

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
		description:
			'Registered account name; must contain a letter and may include titles such as "S.Psi., M.Psi.". Rejects < > & " ` \\ / and control or invisible characters',
		example: 'Siti Rahma, S.Psi.',
		minLength: 2,
		maxLength: 100,
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	@Matches(ACCOUNT_NAME_PATTERN, {
		message: 'name contains unsupported characters',
	})
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
