import { applyDecorators, Body, Header, type Type } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiCommonResponse } from '../../swagger/api-common-response.decorator';
export const QdssResponse = (model: Type<unknown>, summary: string) =>
	applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({
			summary,
			description:
				'Private QDSS model governance. Samples are server-readable; no operator-confidentiality guarantee. Calibration does not read or store personal screening histories. More than 20 samples allowed, local resource cap 100 complete sets.',
		}),
		ApiCommonResponse([200, 400, 401, 403, 404, 409, 413, 429, 500, 503], {
			model,
		}),
	);
