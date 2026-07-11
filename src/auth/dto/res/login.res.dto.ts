import { ApiProperty } from "@nestjs/swagger";

export class LoginResDto {
	@ApiProperty({
		example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMmNiNDQy',
	})
	accessToken!: string;

	@ApiProperty({
		example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMmNiNDQy',
	})
	refreshToken!: string;
}