import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsString, Length } from 'class-validator';

export class VerifyAccountReqDto {
	@ApiProperty({
		description: 'Opaque email verification token',
		example: 'a'.repeat(64),
		minLength: 64,
		maxLength: 64,
	})
	@IsString()
	@IsHexadecimal()
	@Length(64, 64)
	token!: string;
}
