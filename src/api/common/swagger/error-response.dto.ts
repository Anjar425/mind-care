import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
	@ApiProperty({ description: 'HTTP error status', example: 400 })
	statusCode!: number;

	@ApiProperty({
		description: 'Controlled validation or operation messages',
		type: [String],
		example: ['Invalid request'],
	})
	message!: string[];

	@ApiProperty({
		description: 'Error category without internal details',
		example: 'Bad Request',
	})
	error!: string;
}
