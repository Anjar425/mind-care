import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
	ApiExtraModels,
	ApiNoContentResponse,
	ApiResponse,
	getSchemaPath,
	type ApiResponseSchemaHost,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../dto/error-response.dto';
import { SuccessResponseDto } from '../../dto/success-response.dto';
import { DEFAULT_MESSAGE } from '../../constant/default-message.constant';

type Schema = ApiResponseSchemaHost['schema'];
interface CommonResponseOptions {
	model?: Type<unknown>;
	isArray?: boolean;
	withData?: boolean;
	overrides?: Record<number, { message?: string }>;
}

export function ApiCommonResponse(
	statusCodes: number[],
	options?: CommonResponseOptions,
) {
	const extraModels: Type<unknown>[] = [SuccessResponseDto, ErrorResponseDto];
	if (options?.model) extraModels.push(options.model);
	const decorators = statusCodes.map((status) => {
		if (status === Number(HttpStatus.NO_CONTENT))
			return ApiNoContentResponse({ description: 'No Content' });
		const success = status >= 200 && status < 300;
		const def = DEFAULT_MESSAGE[status] ?? {
			message: success ? 'Success' : 'Request rejected',
			error: HttpStatus[status] ?? 'Request Error',
		};
		const message =
			status >= 500
				? 'Internal server error'
				: (options?.overrides?.[status]?.message ?? def.message);
		const allOf: Schema[] = [
			{
				$ref: getSchemaPath(
					success ? SuccessResponseDto : ErrorResponseDto,
				),
			},
			{
				properties: {
					statusCode: { type: 'integer', example: status },
					message: success
						? { type: 'string', example: message }
						: {
								type: 'array',
								items: { type: 'string' },
								example: [message],
							},
					...(!success
						? {
								error: {
									type: 'string' as const,
									example: def.error,
								},
							}
						: {}),
				},
			},
		];
		if (success && options?.model) {
			allOf.push({
				required: ['data'],
				properties: {
					data: options.isArray
						? {
								type: 'array',
								items: { $ref: getSchemaPath(options.model) },
							}
						: { $ref: getSchemaPath(options.model) },
				},
			});
		} else if (success && options?.withData) {
			allOf.push({ properties: { data: { type: 'object' } } });
		}
		return ApiResponse({ status, description: message, schema: { allOf } });
	});
	return applyDecorators(ApiExtraModels(...extraModels), ...decorators);
}
