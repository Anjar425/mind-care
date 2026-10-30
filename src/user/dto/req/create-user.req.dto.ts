import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

import { UserRole } from '@/common/constant/role.constant';
import { UserDto } from '../user.dto';

export class CreateUserReqDto extends UserDto {
	@ApiProperty({ enum: UserRole, example: UserRole.USER })
	@IsNotEmpty()
	@IsEnum(UserRole)
	role!: UserRole;

	@ApiProperty({ required: false, example: '2025-01-01T00:00:00.000Z' })
	@IsOptional()
	@IsDateString()
	email_verified_at?: string;
}