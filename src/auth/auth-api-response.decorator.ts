import { applyDecorators, type Type } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiExtraModels,
	ApiInternalServerErrorResponse,
	ApiOkResponse,
	ApiUnauthorizedResponse,
	getSchemaPath,
} from '@nestjs/swagger';
import type { ApiResponseSchemaHost } from '@nestjs/swagger';
import { MessageResponse } from '@/common/decorator/api/message-response.decorator';
import {
	AuthErrorResponseDto,
	AuthSuccessResponseDto,
} from './dto/res/auth-response.dto';

type ErrorStatus = 400 | 401 | 409 | 500;

export function AuthApiResponse(
	status: 200 | 201,
	message: string,
	model?: Type<unknown>,
	errors: readonly ErrorStatus[] = [400, 500],
) {
	const schema: ApiResponseSchemaHost['schema'] = {
		allOf: [
			{ $ref: getSchemaPath(AuthSuccessResponseDto) },
			{
				type: 'object',
				properties: {
					statusCode: { type: 'integer', example: status },
					message: { type: 'string', example: message },
				},
			},
			...(model
				? [
						{
							type: 'object' as const,
							required: ['data'],
							properties: {
								data: { $ref: getSchemaPath(model) },
							},
						},
					]
				: []),
		],
	};
	const errorDecorators = {
		400: ApiBadRequestResponse,
		401: ApiUnauthorizedResponse,
		409: ApiConflictResponse,
		500: ApiInternalServerErrorResponse,
	};
	const errorExamples = {
		400: { message: ['Invalid request'], error: 'Bad Request' },
		401: { message: ['Invalid credentials'], error: 'Unauthorized' },
		409: {
			message: ['Account identity already exists'],
			error: 'Conflict',
		},
		500: {
			message: ['Internal server error'],
			error: 'Internal Server Error',
		},
	};
	return applyDecorators(
		MessageResponse(message),
		ApiExtraModels(
			AuthSuccessResponseDto,
			AuthErrorResponseDto,
			...(model ? [model] : []),
		),
		(status === 201 ? ApiCreatedResponse : ApiOkResponse)({
			description: message,
			schema,
		}),
		...errors.map((error) =>
			errorDecorators[error]({
				schema: {
					allOf: [
						{ $ref: getSchemaPath(AuthErrorResponseDto) },
						{
							properties: {
								statusCode: { type: 'integer', example: error },
								message: {
									type: 'array',
									items: { type: 'string' },
									example: errorExamples[error].message,
								},
								error: {
									type: 'string',
									example: errorExamples[error].error,
								},
							},
						},
					],
				},
			}),
		),
	);
}
