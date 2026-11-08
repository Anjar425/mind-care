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
	ConflictPageDto,
	ConflictRefreshDto,
	ConflictDetailDto,
	ConflictAuditPageDto,
	ResolutionDto,
	ResolutionCancellationDto,
	Dass42AssessmentDto,
} from '../../../common/dto/rule-conflicts/conflict-responses.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../../domain/identity/identity.types';
import { PositiveIntIdPipe } from '../../../common/pipes/positive-int-id.pipe';
import { RuleConflictsService } from '../../../../domain/rule-conflicts/rule-conflicts.service';
import { RuleResolutionService } from '../../../../domain/rule-conflicts/rule-resolution.service';
import { Dass42RuleAssessmentService } from '../../../../domain/rules/conflicts/dass42-rule-assessment.service';
import {
	ConflictListQuery,
	ConflictPageQuery,
	ConsentDto,
	CreateResolutionDto,
	ReasonedConsentDto,
	RefreshConflictsDto,
} from '../../../common/dto/rule-conflicts/conflict-requests.dto';

import { ConflictReviewResponse } from '../../../common/dto/rule-conflicts/rule-conflict-api.decorator';
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
	@ConflictReviewResponse(
		'List recorded conflicts and assess the fresh source snapshot',
		ConflictPageDto,
	)
	list(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Query() q: ConflictListQuery,
	) {
		return this.conflicts.list(req.user.sub, groupId, q);
	}
	@Post('rule-conflicts/refresh')
	@HttpCode(200)
	@ConflictReviewResponse(
		'Refresh current conflict cases; valid member credentials required',
		ConflictRefreshDto,
	)
	refresh(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Body() dto: RefreshConflictsDto,
	) {
		return this.conflicts.refresh(req.user.sub, groupId, dto);
	}
	@Get('rule-conflicts/:caseId')
	@ConflictReviewResponse(
		'Read immutable conflict member revisions as an active member',
		ConflictDetailDto,
	)
	detail(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
	) {
		return this.conflicts.detail(req.user.sub, groupId, caseId);
	}
	@Get('rule-conflicts/:caseId/audit')
	@ConflictReviewResponse(
		'Read a bounded professional conflict audit',
		ConflictAuditPageDto,
	)
	audit(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Query() q: ConflictPageQuery,
	) {
		return this.conflicts.audit(req.user.sub, groupId, caseId, q);
	}
	@Post('rule-conflicts/:caseId/proposals')
	@ConflictReviewResponse(
		'Propose a seven-day immutable correction requiring every conflict author',
		ResolutionDto,
		true,
	)
	propose(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Body() dto: CreateResolutionDto,
	) {
		return this.resolutions.create(req.user.sub, groupId, caseId, dto);
	}
	@Get('rule-conflicts/:caseId/proposals/:proposalId')
	@ConflictReviewResponse(
		'Read the exact correction plan and required decisions',
		ResolutionDto,
	)
	proposal(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('caseId', ParseUUIDPipe) caseId: string,
		@Param('proposalId', ParseUUIDPipe) id: string,
	) {
		return this.resolutions.detail(req.user.sub, groupId, caseId, id);
	}
	@Post('rule-conflicts/:caseId/proposals/:proposalId/approve')
	@HttpCode(200)
	@ConflictReviewResponse(
		'Approve the exact plan; last required approval applies it atomically',
		ResolutionDto,
	)
	approve(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
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
	@ConflictReviewResponse(
		'Reject the pending plan with a reason; preserve rules',
		ResolutionDto,
	)
	reject(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
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
	@ConflictReviewResponse(
		'Withdraw a pending plan without deleting earlier decisions',
		ResolutionCancellationDto,
	)
	cancel(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
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
	@ConflictReviewResponse(
		'Assess fresh eligible-author rules separately from governance conflicts',
		Dass42AssessmentDto,
	)
	assess(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
	) {
		return this.assessment.privateAssessment(req.user.sub, groupId);
	}
}
