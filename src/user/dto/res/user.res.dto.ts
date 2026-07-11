import { ApiProperty, OmitType } from '@nestjs/swagger';
import { UserDto } from '../user.dto';

export class UserResDto extends OmitType(UserDto, ['password'] as const) {
	@ApiProperty({ example: 'a1b2c3d4-...' })
	id!: string;
}