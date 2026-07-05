import {
	IsDateString,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
	Matches,
} from 'class-validator';

export enum UserRole {
	ADMIN = 'ADMIN',
	EXPERT = 'EXPERT',
	USER = 'USER',
}

export class CreateUserDto {
	@IsNotEmpty()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	name!: string;

	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@MaxLength(100)
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
		message: 'password must contain uppercase, lowercase, and number',
	})
	password!: string;

	@IsNotEmpty()
	@IsEnum(UserRole)
	role!: UserRole;

	@IsOptional()
	@IsDateString()
	email_verified_at?: string;
}
