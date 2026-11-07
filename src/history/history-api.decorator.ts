import { applyDecorators, type Type } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
export function HistoryResponse(
	model: Type<unknown>,
	summary: string,
	created = false,
	retry = false,
) {
	return applyDecorators(
		ApiOperation({
			summary,
			description:
				'Owner-only opaque encrypted history. Requires a live USER/EXPERT session. No administrator override, server decryption, guest persistence or clinical-content certification. Browser keys/recovery remain user-held; backup erasure is not immediate.',
		}),
		ApiCommonResponse(
			[
				created ? 201 : 200,
				...(retry ? [201] : []),
				400,
				401,
				403,
				404,
				409,
				413,
				415,
				429,
				500,
				503,
			],
			{ model },
		),
	);
}
