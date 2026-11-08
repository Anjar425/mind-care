import { Match } from '@/api/common/validation/match.decorator';
import { UserDto } from '@/api/public/auth/dto/user.dto';
import { ApiProperty, PickType } from '@nestjs/swagger';
import type { RegisterInput } from '../../../../../domain/identity/identity.types';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterReqDto
	extends PickType(UserDto, ['email', 'name', 'password'] as const)
	implements RegisterInput
{
	@ApiProperty({
		description: 'Must exactly match password',
		example: 'Passw0rd123',
	})
	@IsNotEmpty()
	@IsString()
	@Match('password', { message: 'confirm_password must match password' })
	confirm_password!: string;
}
