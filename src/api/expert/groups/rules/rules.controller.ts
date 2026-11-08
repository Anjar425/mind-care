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
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../../domain/identity/identity.types';
import { ApiCommonResponse } from '../../../common/swagger/api-common-response.decorator';
import { RulesService } from '../../../../domain/rules/rules.service';
import { PositiveIntIdPipe } from '../../../common/pipes/positive-int-id.pipe';
import {
	ArchiveRuleDto,
	CreateRuleDto,
	RulesPageQuery,
	RulesQuery,
	UpdateRuleDto,
} from '../../../common/dto/rules/rule-requests.dto';
import {
	RuleDetailDto,
	RuleRevisionDetailDto,
	RuleRevisionsPageDto,
	RulesPageDto,
} from '../../../common/dto/rules/rule-responses.dto';

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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Body() dto: CreateRuleDto,
	) {
		return this.rules.create(req.user.sub, groupId, dto);
	}
	@Get('dass42-rules')
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('ruleId', PositiveIntIdPipe) id: number,
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('ruleId', PositiveIntIdPipe) id: number,
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('ruleId', PositiveIntIdPipe) id: number,
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('ruleId', PositiveIntIdPipe) id: number,
		@Param('version', PositiveIntIdPipe) version: number,
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('ruleId', PositiveIntIdPipe) id: number,
		@Body() dto: ArchiveRuleDto,
	) {
		return this.rules.archive(req.user.sub, groupId, id, dto);
	}
}
