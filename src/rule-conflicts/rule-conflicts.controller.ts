import {
	applyDecorators,
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
	UseGuards,
	type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import {
	ConflictPageDto,
	ConflictRefreshDto,
	ConflictDetailDto,
	ConflictAuditPageDto,
	ResolutionDto,
	ResolutionCancellationDto,
	Dass42AssessmentDto,
	ConflictInboxPageDto,
	NoticeReadDto,
	ConflictSummariesPageDto,
	ReminderDto,
} from './dto/conflict-responses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessPrincipal } from '../auth/session.types';
import { RuleIdPipe } from '../rules/rule-id.pipe';
import { RuleConflictsService } from './rule-conflicts.service';
import { RuleResolutionService } from './rule-resolution.service';
import { Dass42RuleAssessmentService } from './dass42-rule-assessment.service';
import {
	ConflictInboxQuery,
	ConflictListQuery,
	ConflictPageQuery,
	ConsentDto,
	CreateResolutionDto,
	EmptyConflictDto,
	ReasonedConsentDto,
	RefreshConflictsDto,
} from './dto/conflict-requests.dto';

const ReviewResponse = (
	summary: string,
	model: Type<unknown>,
	created = false,
) =>
	applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({
			summary,
			description:
				'Private professional governance. A conflict-free snapshot is not clinical validation or an executable screening. No patient data in reasons.',
		}),
		ApiCommonResponse(
			[created ? 201 : 200, 400, 401, 403, 404, 409, 429, 500, 503],
			{ model },
		),
	);
type Request = { user: AccessPrincipal };
@ApiTags('DASS42 conflict governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/groups/:groupId')
export class RuleConflictsController {
	constructor(
		private readonly conflicts: RuleConflictsService,
		private readonly resolutions: RuleResolutionService,
		private readonly assessment: Dass42RuleAssessmentService,
	) {}
	@Get('rule-conflicts')
	@ReviewResponse(
		'List recorded conflicts and assess the fresh source snapshot',
		ConflictPageDto,
	)
	list(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Query() q: ConflictListQuery,
	) {
		return this.conflicts.list(req.user.sub, groupId, q);
	}
	@Post('rule-conflicts/refresh')
	@HttpCode(200)
	@ReviewResponse(
		'Refresh current conflict cases; valid member credentials required',
		ConflictRefreshDto,
	)
	refresh(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Body() dto: RefreshConflictsDto,
	) {
		return this.conflicts.refresh(req.user.sub, groupId, dto);
	}
	@Get('rule-conflicts/:caseId')
	@ReviewResponse(
		'Read immutable conflict member revisions as an active member',
		ConflictDetailDto,
	)
	detail(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
	) {
		return this.conflicts.detail(req.user.sub, groupId, caseId);
	}
	@Get('rule-conflicts/:caseId/audit')
	@ReviewResponse(
		'Read a bounded professional conflict audit',
		ConflictAuditPageDto,
	)
	audit(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Query() q: ConflictPageQuery,
	) {
		return this.conflicts.audit(req.user.sub, groupId, caseId, q);
	}
	@Post('rule-conflicts/:caseId/proposals')
	@ReviewResponse(
		'Propose a seven-day immutable correction requiring every conflict author',
		ResolutionDto,
		true,
	)
	propose(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Body() dto: CreateResolutionDto,
	) {
		return this.resolutions.create(req.user.sub, groupId, caseId, dto);
	}
	@Get('rule-conflicts/:caseId/proposals/:proposalId')
	@ReviewResponse(
		'Read the exact correction plan and required decisions',
		ResolutionDto,
	)
	proposal(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Param('proposalId', ParseUUIDPipe) id: string,
	) {
		return this.resolutions.detail(req.user.sub, groupId, caseId, id);
	}
	@Post('rule-conflicts/:caseId/proposals/:proposalId/approve')
	@HttpCode(200)
	@ReviewResponse(
		'Approve the exact plan; last required approval applies it atomically',
		ResolutionDto,
	)
	approve(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Param('proposalId', ParseUUIDPipe) id: string,
		@Body() dto: ConsentDto,
	) {
		return this.resolutions.decide(
			req.user.sub,
			groupId,
			caseId,
			id,
			dto,
			'APPROVE',
		);
	}
	@Post('rule-conflicts/:caseId/proposals/:proposalId/reject')
	@HttpCode(200)
	@ReviewResponse(
		'Reject the pending plan with a reason; preserve rules',
		ResolutionDto,
	)
	reject(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Param('proposalId', ParseUUIDPipe) id: string,
		@Body() dto: ReasonedConsentDto,
	) {
		return this.resolutions.decide(
			req.user.sub,
			groupId,
			caseId,
			id,
			dto,
			'REJECT',
		);
	}
	@Post('rule-conflicts/:caseId/proposals/:proposalId/cancel')
	@HttpCode(200)
	@ReviewResponse(
		'Withdraw a pending plan without deleting earlier decisions',
		ResolutionCancellationDto,
	)
	cancel(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Param('proposalId', ParseUUIDPipe) id: string,
		@Body() dto: ReasonedConsentDto,
	) {
		return this.resolutions.decide(
			req.user.sub,
			groupId,
			caseId,
			id,
			dto,
			'CANCEL',
		);
	}
	@Get('dass42-rule-assessment')
	@ReviewResponse(
		'Assess fresh eligible-author rules separately from governance conflicts',
		Dass42AssessmentDto,
	)
	assess(@Req() req: Request, @Param('groupId', RuleIdPipe) groupId: number) {
		return this.assessment.privateAssessment(req.user.sub, groupId);
	}
}
@ApiTags('Conflict inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/me/conflict-notifications')
export class ConflictNotificationsController {
	constructor(private readonly conflicts: RuleConflictsService) {}
	@Get()
	@ReviewResponse(
		'Read your own in-app notification metadata; no group content grant',
		ConflictInboxPageDto,
	)
	list(@Req() req: Request, @Query() q: ConflictInboxQuery) {
		return this.conflicts.inbox(req.user.sub, q);
	}
	@Post(':notificationId/read')
	@HttpCode(200)
	@ReviewResponse(
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
@ApiTags('Admin conflict oversight')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/rule-conflicts')
export class AdminRuleConflictsController {
	constructor(private readonly conflicts: RuleConflictsService) {}
	@Get()
	@ReviewResponse(
		'Read minimal conflict summaries without raw rules or expert profiles',
		ConflictSummariesPageDto,
	)
	list(@Req() req: Request, @Query() q: ConflictListQuery) {
		return this.conflicts.adminList(req.user.sub, q);
	}
	@Post(':caseId/notify')
	@HttpCode(200)
	@ReviewResponse(
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
