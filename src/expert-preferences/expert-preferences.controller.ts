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
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessPrincipal } from '../auth/session.types';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { ExpertPreferencesService } from './expert-preferences.service';
import { ReplaceExpertPreferencesDto } from './dto/req/replace-expert-preferences.req.dto';
import { ExpertPreferencesResDto } from './dto/res/expert-preferences.res.dto';

@ApiTags('Expert preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/me/preferences')
export class ExpertPreferencesController {
	constructor(private readonly service: ExpertPreferencesService) {}
	@Get()
	@Header('Cache-Control', 'no-store')
	@ApiOperation({
		summary: 'Read your private DASS21 preferences and comparison hash',
		description:
			'Owner reads remain available during credential expiry/suspension. No rows or default vectors are created.',
	})
	@ApiCommonResponse([200, 401, 403, 409, 429, 500, 503], {
		model: ExpertPreferencesResDto,
	})
	read(@Req() req: { user: AccessPrincipal }) {
		return this.service.read(req.user.sub);
	}
	@Put()
	@Header('Cache-Control', 'no-store')
	@UseGuards(VerifiedEmailGuard)
	@ApiOperation({
		summary: 'Save all 21 DASS21 D/A/S preference groups atomically',
		description:
			'Each group totals exactly 100 with integer 0–100 components. Requires current valid credentials; the capability profile and four QDSS factors may be completed later. Values are never normalized. Return catalogVersion and the latest owner stateHash as expectedStateHash.',
	})
	@ApiCommonResponse([200, 400, 401, 403, 409, 429, 500, 503], {
		model: ExpertPreferencesResDto,
	})
	replace(
		@Req() req: { user: AccessPrincipal },
		@Body() dto: ReplaceExpertPreferencesDto,
	) {
		return this.service.replace(req.user.sub, dto);
	}
}
