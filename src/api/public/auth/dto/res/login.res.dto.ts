import { ApiProperty } from '@nestjs/swagger';
import { AuthUserResDto } from './auth-user.res.dto';

export class LoginResDto {
	@ApiProperty({
		description: 'Session-bound access token',
		example: 'access-token-example',
	})
	accessToken!: string;

	@ApiProperty({
		description: 'Single-use refresh token; replace it after every refresh',
		example: 'refresh-token-example',
	})
	refreshToken!: string;

	@ApiProperty({ description: 'Safe account fields', type: AuthUserResDto })
	user!: AuthUserResDto;
}
