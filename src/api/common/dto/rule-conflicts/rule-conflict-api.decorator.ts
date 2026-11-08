import { applyDecorators, Body, Header, type Type } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiCommonResponse } from '../../swagger/api-common-response.decorator';

export const ConflictReviewResponse = (
	summary: string,
	model: Type<unknown>,
	created = false,
) =>
	applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({
			summary,
			description:
				'Private professional governance. A conflict-free snapshot is not clinical validation or an executable screening. No patient data in reasons.',
		}),
		ApiCommonResponse(
			[created ? 201 : 200, 400, 401, 403, 404, 409, 429, 500, 503],
			{ model },
		),
	);
