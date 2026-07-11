import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsNotEmpty,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from 'class-validator';

export class UserDto {
	@ApiProperty({ example: 'user@example.com' })
	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@ApiProperty({ example: 'User', minLength: 2, maxLength: 100 })
	@IsNotEmpty()
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	name!: string;

	@ApiProperty({ example: 'Passw0rd123', minLength: 8, maxLength: 100 })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@MaxLength(100)
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
		message: 'password must contain uppercase, lowercase, and number',
	})
	password!: string;
}
