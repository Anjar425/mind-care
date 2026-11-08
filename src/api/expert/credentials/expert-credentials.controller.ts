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
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { VerifiedEmailGuard } from '../../common/auth/verified-email.guard';
import { ApiCommonResponse } from '../../common/swagger/api-common-response.decorator';
import { CredentialType } from '../../../infrastructure/prisma/generated/client';
import {
	MAX_DOCUMENT_BYTES,
	type CredentialUpload,
} from '../../../domain/credentials/credential-policy';
import { ExpertCredentialsService } from '../../../domain/credentials/expert-credentials.service';
import {
	CredentialStateDto,
	SubmitCredentialDto,
} from '../../common/dto/credentials/credential.dto';
import { privateDocument } from '../../common/privacy/private-document';

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
