import { ApiProperty } from '@nestjs/swagger';
import {
	ERROR_CODES,
	type ErrorCode,
} from '../../../shared/contracts/error-codes';

/** Documents the catalogued `code` field shared by every error body. */
export const ErrorCodeProperty = () =>
	ApiProperty({
		description:
			'Stable machine-readable error code; branch on this, not on message text. ' +
			Object.entries(ERROR_CODES)
				.map(([code, meaning]) => `${code}: ${meaning}.`)
				.join(' '),
		enum: Object.keys(ERROR_CODES),
		enumName: 'ErrorCode',
		example: 'VALIDATION_FAILED',
	});

export class ErrorResponseDto {
	@ApiProperty({ description: 'HTTP error status', example: 400 })
	statusCode!: number;

	@ErrorCodeProperty()
	code!: ErrorCode;

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
