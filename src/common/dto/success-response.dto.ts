import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
	@ApiProperty()
	statusCode!: number;

	@ApiProperty()
	message!: string[];
}
