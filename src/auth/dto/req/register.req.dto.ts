import { Match } from '@/common/decorator/validation/match.decorator';
import { UserDto } from '@/user/dto/user.dto';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterReqDto extends PickType(UserDto, [
	'email',
	'name',
	'password',
] as const) {
	@ApiProperty({ example: 'Passw0rd123' })
	@IsNotEmpty()
	@IsString()
	@Match('password', { message: 'confirm_password must match password' })
	confirm_password!: string;
}
