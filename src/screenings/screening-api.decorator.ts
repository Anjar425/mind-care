import { applyDecorators, type Type } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
export function ScreeningResponseDocumentation(
	model: Type<unknown>,
	summary: string,
) {
	return applyDecorators(
		ApiOperation({
			summary,
			security: [{}, { 'access-token': [] }],
			description:
				'Public stateless screening. Anonymous requests are guests. Every supplied Bearer token is validated against a current session; invalid tokens never downgrade to guest. Authenticated personal use requires USER/EXPERT. No guest persistence, automatic calibration, private model/rule dump or third-party alert. Numerical results are screening support, not diagnosis.',
		}),
		ApiCommonResponse(
			[200, 400, 401, 403, 404, 409, 413, 415, 429, 500, 503],
			{ model },
		),
	);
}
