import {
	Body,
	Controller,
	Get,
	Header,
	Param,
	ParseEnumPipe,
	ParseUUIDPipe,
	Post,
	Req,
	Res,
	StreamableFile,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AccessPrincipal } from '../auth/session.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { CredentialType } from '../prisma/generated/client';
import { MAX_DOCUMENT_BYTES, type CredentialUpload } from './credential-policy';
import { ExpertCredentialsService } from './expert-credentials.service';
import { CredentialStateDto, SubmitCredentialDto } from './dto/credential.dto';

export function privateDocument(
	result: { bytes: Buffer; mime: string; filename: string },
	res: Response,
) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('X-Content-Type-Options', 'nosniff');
	return new StreamableFile(result.bytes, {
		type: result.mime,
		disposition: `attachment; filename="${result.filename}"`,
	});
}

@ApiTags('Expert credentials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/me/credentials')
export class ExpertCredentialsController {
	constructor(private readonly service: ExpertCredentialsService) {}
	@Get()
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary:
			'Read your private STR/SIP state and credential-only eligibility',
	})
	@ApiCommonResponse([200, 401, 403, 429, 500, 503], {
		model: CredentialStateDto,
	})
	state(@Req() req: { user: AccessPrincipal }) {
		return this.service.state(req.user.sub);
	}

	@Post(':type')
	@UseGuards(VerifiedEmailGuard)
	@UseInterceptors(
		FileInterceptor('file', {
			limits: {
				fileSize: MAX_DOCUMENT_BYTES,
				files: 1,
				fields: 4,
				fieldSize: 1024,
				parts: 6,
			},
		}),
	)
	@ApiOperation({
		summary: 'Submit an immutable STR or SIP revision for manual review',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			additionalProperties: false,
			required: [
				'number',
				'holderName',
				'expiryDate',
				'expectedVersion',
				'file',
			],
			properties: {
				number: {
					type: 'string',
					maxLength: 100,
					example: 'STR-12345',
				},
				holderName: {
					type: 'string',
					maxLength: 200,
					example: 'Example Expert',
				},
				expiryDate: {
					type: 'string',
					format: 'date',
					example: '2027-12-12',
				},
				expectedVersion: { type: 'integer', minimum: 0, example: 0 },
				file: { type: 'string', format: 'binary' },
			},
		},
	})
	@ApiCommonResponse([201, 400, 401, 403, 409, 413, 415, 429, 500, 503], {
		model: CredentialStateDto,
	})
	submit(
		@Req() req: { user: AccessPrincipal },
		@Param('type', new ParseEnumPipe(CredentialType)) type: CredentialType,
		@Body() dto: SubmitCredentialDto,
		@UploadedFile() file: CredentialUpload,
	) {
		return this.service.submit(req.user.sub, type, dto, file);
	}

	@Get(':revisionId/document')
	@ApiOperation({
		summary: 'Download your retained credential document privately',
	})
	@ApiOkResponse({
		description: 'Private document attachment',
		content: {
			'application/pdf': { schema: { type: 'string', format: 'binary' } },
			'image/png': { schema: { type: 'string', format: 'binary' } },
			'image/jpeg': { schema: { type: 'string', format: 'binary' } },
		},
	})
	@ApiCommonResponse([400, 401, 403, 404, 429, 500, 503])
	async download(
		@Req() req: { user: AccessPrincipal },
		@Param('revisionId', new ParseUUIDPipe()) id: string,
		@Res({ passthrough: true }) res: Response,
	) {
		return privateDocument(
			await this.service.download(req.user.sub, id),
			res,
		);
	}
}
