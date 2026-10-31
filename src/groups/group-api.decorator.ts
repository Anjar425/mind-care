import { applyDecorators, Header, type Type } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';

export function GroupResponse(
	model: Type<unknown>,
	summary: string,
	created = false,
	publicRoute = false,
) {
	return applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({ summary }),
		ApiCommonResponse(
			[
				created ? 201 : 200,
				400,
				...(publicRoute ? [] : [401, 403]),
				404,
				409,
				429,
				500,
				503,
			],
			{ model },
		),
	);
}
