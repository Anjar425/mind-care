import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../dto/error-response.dto';
import { SuccessResponseDto } from '../../dto/success-response.dto';
import { DEFAULT_MESSAGE } from '../../constant/default-message.constant';

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
	const isSuccess = (s: number) => s < 300;
	const extraModels: Type<unknown>[] = [SuccessResponseDto, ErrorResponseDto];
	if (options?.model) extraModels.push(options.model);

	const decorators = statusCodes.map((status) => {
		const def = DEFAULT_MESSAGE[status] ?? {
			message: 'Error',
			error: 'Error',
		};
		const message = options?.overrides?.[status]?.message ?? def.message;

		if (isSuccess(status)) {
			const schema: any = {
				allOf: [
					{ $ref: getSchemaPath(SuccessResponseDto) },
					{
						properties: {
							statusCode: { example: status },
							message: { example: [message] },
						},
					},
				],
			};

			if (options?.model) {
				schema.allOf.push({
					properties: {
						data: options.isArray
							? {
									type: 'array',
									items: {
										$ref: getSchemaPath(options.model),
									},
								}
							: {
									$ref: getSchemaPath(options.model),
								},
					},
				});
			} else if (options?.withData) {
				schema.allOf.push({
					properties: {
						data: {
							type: 'object',
						},
					},
				});
			}

			return ApiResponse({
				status,
				description: message,
				schema,
			});
		}

		return ApiResponse({
			status,
			description: message,
			schema: {
				allOf: [
					{ $ref: getSchemaPath(ErrorResponseDto) },
					{
						properties: {
							statusCode: { example: status },
							message: { example: [message] },
							error: { example: def.error },
						},
					},
				],
			},
		});
	});

	return applyDecorators(ApiExtraModels(...extraModels), ...decorators);
}
