import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '@/common/constant/role.constant';
import { UserResDto } from './user.res.dto';

export class CreateUserResDto extends UserResDto {
	@ApiProperty({ enum: UserRole })
	role!: UserRole;

	@ApiProperty({ required: false, nullable: true })
	email_verified_at?: string | null;
}