import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
	@ApiProperty({
		description: 'Availability of the requested health check',
		enum: ['ok'],
		example: 'ok',
	})
	status!: 'ok';
}
