import {
	Body,
	Controller,
	Get,
	Header,
	Put,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import type { AccessPrincipal } from '../auth/session.types';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { ExpertProfileService } from './expert-profile.service';
import { UpsertExpertProfileDto } from './dto/req/upsert-expert-profile.req.dto';
import { ExpertProfileResDto } from './dto/res/expert-profile.res.dto';

@ApiTags('Expert self profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/me/profile')
export class ExpertProfileController {
	constructor(private readonly service: ExpertProfileService) {}
	@Get()
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary: 'Read your private capability profile and four QDSS weights',
		description:
			'Owner reads remain available while credentials are pending or expired. Completeness does not imply full expert/group eligibility.',
	})
	@ApiCommonResponse([200, 401, 403, 429, 500, 503], {
		model: ExpertProfileResDto,
	})
	read(@Req() req: { user: AccessPrincipal }) {
		return this.service.read(req.user.sub);
	}
	@Put()
	@Header('Cache-Control', 'no-store')
	@UseGuards(VerifiedEmailGuard)
	@ApiOperation({
		summary:
			'Replace your complete capability profile and four factor weights atomically',
		description:
			'Requires current approved, unexpired STR and SIP and no suspension. All four integer percentages must total exactly 100; values are never rescaled. This endpoint does not calculate QDSS or DASS42 results.',
	})
	@ApiCommonResponse([200, 400, 401, 403, 409, 429, 500, 503], {
		model: ExpertProfileResDto,
	})
	submit(
		@Req() req: { user: AccessPrincipal },
		@Body() dto: UpsertExpertProfileDto,
	) {
		return this.service.submit(req.user.sub, dto);
	}
}
