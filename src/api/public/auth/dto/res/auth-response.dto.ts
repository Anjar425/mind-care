import { ApiProperty } from '@nestjs/swagger';
import type { ErrorCode } from '../../../../../shared/contracts/error-codes';
import {
	ErrorCodeProperty,
	RequestIdProperty,
} from '../../../../common/swagger/error-response.dto';

export class AuthSuccessResponseDto {
	@ApiProperty({ description: 'HTTP success status', example: 200 })
	statusCode!: number;
	@ApiProperty({
		description: 'Human-readable operation message',
		example: 'Login successful',
	})
	message!: string;
}

export class AuthErrorResponseDto {
	@ApiProperty({ description: 'HTTP error status', example: 400 })
	statusCode!: number;
	@ErrorCodeProperty()
	code!: ErrorCode;
	@ApiProperty({
		description: 'Safe validation or operation errors',
		type: [String],
		example: ['Invalid credentials'],
	})
	message!: string[];
	@ApiProperty({
		description: 'Error category without internal details',
		example: 'Bad Request',
	})
	error!: string;
	@RequestIdProperty()
	requestId!: string;
}

export class AuthMessageResDto {
	@ApiProperty({
		description: 'Operation outcome',
		example: 'Logged out successfully',
	})
	message!: string;
}
