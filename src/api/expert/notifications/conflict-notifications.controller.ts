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
	ConflictInboxPageDto,
	NoticeReadDto,
} from '../../common/dto/rule-conflicts/conflict-responses.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { RuleConflictsService } from '../../../domain/rule-conflicts/rule-conflicts.service';
import {
	ConflictInboxQuery,
	EmptyConflictDto,
} from '../../common/dto/rule-conflicts/conflict-requests.dto';

import { ConflictReviewResponse } from '../../common/dto/rule-conflicts/rule-conflict-api.decorator';
type Request = { user: AccessPrincipal };
@ApiTags('Conflict inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/notifications')
export class ConflictNotificationsController {
	constructor(private readonly conflicts: RuleConflictsService) {}
	@Get()
	@ConflictReviewResponse(
		'Read your own in-app notification metadata; no group content grant',
		ConflictInboxPageDto,
	)
	list(@Req() req: Request, @Query() q: ConflictInboxQuery) {
		return this.conflicts.inbox(req.user.sub, q);
	}
	@Post(':notificationId/read')
	@HttpCode(200)
	@ConflictReviewResponse(
		'Mark your own notification read idempotently',
		NoticeReadDto,
	)
	read(
		@Req() req: Request,
		@Param('notificationId', ParseUUIDPipe) id: string,
		@Body() _dto: EmptyConflictDto,
	) {
		void _dto;
		return this.conflicts.read(req.user.sub, id);
	}
}
