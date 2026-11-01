import {
	applyDecorators,
	Body,
	Controller,
	Get,
	Header,
	HttpCode,
	Param,
	Post,
	Put,
	Query,
	Req,
	UseGuards,
	type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessPrincipal } from '../auth/session.types';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { RulesService } from './rules.service';
import { RuleIdPipe } from './rule-id.pipe';
import {
	ArchiveRuleDto,
	CreateRuleDto,
	RulesPageQuery,
	RulesQuery,
	UpdateRuleDto,
} from './dto/rule-requests.dto';
import {
	RuleDetailDto,
	RuleRevisionDetailDto,
	RuleRevisionsPageDto,
	RulesPageDto,
} from './dto/rule-responses.dto';

const RuleResponse = (model: Type<unknown>, summary: string, created = false) =>
	applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({
			summary,
			description:
				'Private authoring only. Saved syntax is not clinical validation, conflict approval or executable screening. AND/OR fold left to right; NOT applies to its own literal; final THEN is mandatory.',
		}),
		ApiCommonResponse(
			[created ? 201 : 200, 400, 401, 403, 404, 409, 429, 500, 503],
			{ model },
		),
	);
@ApiTags('DASS42 rule authoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert')
export class RulesController {
	constructor(private readonly rules: RulesService) {}
	@Post('groups/:groupId/dass42-rules')
	@RuleResponse(
		RuleDetailDto,
		'Create your group rule; valid credentials/member required, profile may follow',
		true,
	)
	create(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Body() dto: CreateRuleDto,
	) {
		return this.rules.create(req.user.sub, groupId, dto);
	}
	@Get('me/dass42-rules')
	@RuleResponse(
		RulesPageDto,
		'Read your rules across groups, including own historical access after membership loss',
	)
	mine(@Req() req: { user: AccessPrincipal }, @Query() q: RulesQuery) {
		return this.rules.mine(req.user.sub, q);
	}
	@Get('groups/:groupId/dass42-rules')
	@RuleResponse(
		RulesPageDto,
		'List group rules as an active member; category filters the latest authored revision',
	)
	list(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Query() q: RulesQuery,
	) {
		return this.rules.list(req.user.sub, groupId, q);
	}
	@Get('groups/:groupId/dass42-rules/:ruleId')
	@RuleResponse(
		RuleDetailDto,
		'Read current rule as an active member or its original author',
	)
	detail(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('ruleId', RuleIdPipe) id: number,
	) {
		return this.rules.detail(req.user.sub, groupId, id);
	}
	@Put('groups/:groupId/dass42-rules/:ruleId')
	@RuleResponse(
		RuleDetailDto,
		'Append a full revision as current valid author; reject stale comparison state',
	)
	update(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('ruleId', RuleIdPipe) id: number,
		@Body() dto: UpdateRuleDto,
	) {
		return this.rules.update(req.user.sub, groupId, id, dto);
	}
	@Get('groups/:groupId/dass42-rules/:ruleId/revisions')
	@RuleResponse(
		RuleRevisionsPageDto,
		'Read immutable revision summaries; no current edit token returned',
	)
	revisions(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('ruleId', RuleIdPipe) id: number,
		@Query() q: RulesPageQuery,
	) {
		return this.rules.revisions(req.user.sub, groupId, id, q);
	}
	@Get('groups/:groupId/dass42-rules/:ruleId/revisions/:version')
	@RuleResponse(
		RuleRevisionDetailDto,
		'Read an explicit immutable historical revision; not a current editing grant',
	)
	revision(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('ruleId', RuleIdPipe) id: number,
		@Param('version', RuleIdPipe) version: number,
	) {
		return this.rules.revisionDetail(req.user.sub, groupId, id, version);
	}
	@Post('groups/:groupId/dass42-rules/:ruleId/archive')
	@HttpCode(200)
	@RuleResponse(
		RuleDetailDto,
		'Withdraw your rule with reason and state comparison; preserve all revisions',
	)
	archive(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('ruleId', RuleIdPipe) id: number,
		@Body() dto: ArchiveRuleDto,
	) {
		return this.rules.archive(req.user.sub, groupId, id, dto);
	}
}
