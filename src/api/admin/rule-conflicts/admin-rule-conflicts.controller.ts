import {
	Body,
	Controller,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
	ConflictSummariesPageDto,
	ReminderDto,
} from '../../common/dto/rule-conflicts/conflict-responses.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { RuleConflictsService } from '../../../domain/rule-conflicts/rule-conflicts.service';
import {
	ConflictListQuery,
	EmptyConflictDto,
} from '../../common/dto/rule-conflicts/conflict-requests.dto';

import { ConflictReviewResponse } from '../../common/dto/rule-conflicts/rule-conflict-api.decorator';
type Request = { user: AccessPrincipal };
@ApiTags('Admin conflict oversight')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/rule-conflicts')
export class AdminRuleConflictsController {
	constructor(private readonly conflicts: RuleConflictsService) {}
	@Get()
	@ConflictReviewResponse(
		'Read minimal conflict summaries without raw rules or expert profiles',
		ConflictSummariesPageDto,
	)
	list(@Req() req: Request, @Query() q: ConflictListQuery) {
		return this.conflicts.adminList(req.user.sub, q);
	}
	@Post(':caseId/notify')
	@HttpCode(200)
	@ConflictReviewResponse(
		'Record an in-app reminder to server-selected authors and leader; 24-hour cooldown',
		ReminderDto,
	)
	notify(
		@Req() req: Request,
		@Param('caseId', ParseUUIDPipe) id: string,
		@Body() _dto: EmptyConflictDto,
	) {
		void _dto;
		return this.conflicts.remind(req.user.sub, id);
	}
}
