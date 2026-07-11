import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '@/common/constant/role.constant';
import { UserResDto } from '@/user/dto/res/user.res.dto';

export class RegisterResDto extends UserResDto {
	@ApiProperty({ enum: UserRole })
	role!: UserRole;
}