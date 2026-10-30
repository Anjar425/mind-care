import {
	Body,
	Controller,
	Get,
	Header,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	Res,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AccessPrincipal } from '../auth/session.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { ExpertCredentialsService } from './expert-credentials.service';
import {
	CredentialActionDto,
	CredentialDetailDto,
	CredentialQueueDto,
	CredentialQueueResponseDto,
	ReviewCredentialDto,
} from './dto/credential.dto';
import { privateDocument } from './expert-credentials.controller';
import { ApiProperty } from '@nestjs/swagger';

export class CredentialVersionDto {
	@ApiProperty({
		description: 'Updated credential aggregate version',
		example: 2,
	})
	version: number;
}

@ApiTags('Admin credential review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/expert-credentials')
export class AdminCredentialsController {
	constructor(private readonly service: ExpertCredentialsService) {}
	@Get()
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary: 'Read a bounded private pending-credential queue',
	})
	@ApiCommonResponse([200, 400, 401, 403, 429, 500, 503], {
		model: CredentialQueueResponseDto,
	})
	queue(
		@Req() req: { user: AccessPrincipal },
		@Query() dto: CredentialQueueDto,
	) {
		return this.service.queue(req.user.sub, dto);
	}
	@Get(':revisionId')
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary:
			'Read submitted metadata for an exact private document revision',
	})
	@ApiCommonResponse([200, 400, 401, 403, 404, 429, 500, 503], {
		model: CredentialDetailDto,
	})
	detail(
		@Req() req: { user: AccessPrincipal },
		@Param('revisionId', new ParseUUIDPipe()) id: string,
	) {
		return this.service.detail(req.user.sub, id);
	}
	@Get(':revisionId/document')
	@ApiOperation({
		summary: 'Download the exact credential document for manual review',
	})
	@ApiOkResponse({
		description: 'Private PDF, JPEG or PNG attachment',
		content: {
			'application/octet-stream': {
				schema: { type: 'string', format: 'binary' },
			},
		},
	})
	@ApiCommonResponse([400, 401, 403, 404, 429, 500, 503])
	async download(
		@Req() req: { user: AccessPrincipal },
		@Param('revisionId', new ParseUUIDPipe()) id: string,
		@Res({ passthrough: true }) res: Response,
	) {
		return privateDocument(
			await this.service.download(req.user.sub, id, true),
			res,
		);
	}
	@Post(':revisionId/review')
	@HttpCode(200)
	@ApiOperation({
		summary:
			'Approve or reject an exact immutable credential revision; never edit metadata',
	})
	@ApiCommonResponse([200, 400, 401, 403, 404, 409, 429, 500, 503], {
		model: CredentialVersionDto,
	})
	review(
		@Req() req: { user: AccessPrincipal },
		@Param('revisionId', new ParseUUIDPipe()) id: string,
		@Body() dto: ReviewCredentialDto,
	) {
		return this.service.review(req.user.sub, id, dto);
	}
	@Post(':expertId/suspend')
	@HttpCode(200)
	@ApiOperation({
		summary: 'Suspend expert contribution rights with an auditable reason',
	})
	@ApiCommonResponse([200, 400, 401, 403, 404, 409, 429, 500, 503], {
		model: CredentialVersionDto,
	})
	suspend(
		@Req() req: { user: AccessPrincipal },
		@Param('expertId', new ParseUUIDPipe()) id: string,
		@Body() dto: CredentialActionDto,
	) {
		return this.service.setSuspension(req.user.sub, id, dto, true);
	}
	@Post(':expertId/reinstate')
	@HttpCode(200)
	@ApiOperation({
		summary:
			'Explicitly remove suspension; expired credentials remain ineligible',
	})
	@ApiCommonResponse([200, 400, 401, 403, 404, 409, 429, 500, 503], {
		model: CredentialVersionDto,
	})
	reinstate(
		@Req() req: { user: AccessPrincipal },
		@Param('expertId', new ParseUUIDPipe()) id: string,
		@Body() dto: CredentialActionDto,
	) {
		return this.service.setSuspension(req.user.sub, id, dto, false);
	}
}
