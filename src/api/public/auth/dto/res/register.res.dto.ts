import { ApiProperty } from '@nestjs/swagger';

import { RegisteredAuthUserResDto } from './auth-user.res.dto';

export class RegisterResDto {
	@ApiProperty({
		description:
			'Created account; expert credentials are verified separately',
		type: RegisteredAuthUserResDto,
	})
	user!: RegisteredAuthUserResDto;
}
