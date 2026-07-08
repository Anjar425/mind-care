import {
	IsEmail,
	IsNotEmpty,
	IsString,
	MinLength,
	MaxLength,
	Matches,
	ValidateIf,
	Equals,
} from 'class-validator';

export class RegisterDto {
	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@IsNotEmpty()
	@IsString()
	name!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@MaxLength(32)
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
		message: 'password must contain uppercase, lowercase, and number',
	})
	password!: string;

	@IsNotEmpty()
	@IsString()
	@ValidateIf((o) => o.password !== o.confirm_password)
	@Equals('password', {
		message: 'confirm_password must match password',
	})
	confirm_password!: string;
}
