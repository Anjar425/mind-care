import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
	@ApiProperty({ description: 'HTTP success status', example: 200 })
	statusCode!: number;

	@ApiProperty({ description: 'Operation message', example: 'Success' })
	message!: string;
}
