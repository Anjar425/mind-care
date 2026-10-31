import {
	Body,
	Controller,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessPrincipal } from '../auth/session.types';
import { GroupsService } from './groups.service';
import { GroupEligibilityService } from './group-eligibility.service';
import {
	CreateGroupDto,
	GroupPageQuery,
	GroupStateDto,
	ReasonedGroupDto,
	UpdateGroupDto,
} from './dto/group-requests.dto';
import {
	GroupAuditsPageDto,
	GroupEligibilityDto,
	MembershipEndedDto,
	OwnGroupsPageDto,
	PrivateGroupDto,
} from './dto/group-responses.dto';
import { GroupResponse } from './group-api.decorator';

@ApiTags('Expert groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert')
export class GroupsController {
	constructor(
		private readonly groups: GroupsService,
		private readonly eligibility: GroupEligibilityService,
	) {}
	@Post('groups')
	@GroupResponse(
		PrivateGroupDto,
		'Create a group with yourself as leader; valid credentials required',
		true,
	)
	create(@Req() req: { user: AccessPrincipal }, @Body() dto: CreateGroupDto) {
		return this.groups.create(req.user.sub, dto);
	}
	@Get('me/groups')
	@GroupResponse(
		OwnGroupsPageDto,
		'List your current memberships, including archived groups',
	)
	mine(@Req() req: { user: AccessPrincipal }, @Query() q: GroupPageQuery) {
		return this.groups.mine(req.user.sub, q);
	}
	@Get('groups/:groupId')
	@GroupResponse(
		PrivateGroupDto,
		'Read private group metadata and roster; active membership required',
	)
	detail(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
	) {
		return this.groups.detail(req.user.sub, id);
	}
	@Put('groups/:groupId')
	@GroupResponse(
		PrivateGroupDto,
		'Replace group name/description; current valid leader required',
	)
	update(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Body() dto: UpdateGroupDto,
	) {
		return this.groups.update(req.user.sub, id, dto);
	}
	@Get('groups/:groupId/eligibility')
	@GroupResponse(
		GroupEligibilityDto,
		'Assess current common publication eligibility separately from governance',
	)
	assessment(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
	) {
		return this.eligibility.privateAssessment(req.user.sub, id);
	}
	@Post('groups/:groupId/leave')
	@HttpCode(200)
	@GroupResponse(
		MembershipEndedDto,
		'Leave as an ordinary member; credentials may be expired',
	)
	leave(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Body() dto: GroupStateDto,
	) {
		return this.groups.leave(req.user.sub, id, dto);
	}
	@Post('groups/:groupId/members/:expertId/remove')
	@HttpCode(200)
	@GroupResponse(
		MembershipEndedDto,
		'Remove an ordinary member with a recorded reason; current valid leader required',
	)
	remove(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Param('expertId', new ParseUUIDPipe()) expertId: string,
		@Body() dto: ReasonedGroupDto,
	) {
		return this.groups.remove(req.user.sub, id, expertId, dto);
	}
	@Post('groups/:groupId/archive')
	@HttpCode(200)
	@GroupResponse(
		PrivateGroupDto,
		'Archive with a reason and revoke pending grants; verified leader recovery permitted',
	)
	archive(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Body() dto: ReasonedGroupDto,
	) {
		return this.groups.archive(req.user.sub, id, dto);
	}
	@Get('groups/:groupId/audit')
	@GroupResponse(
		GroupAuditsPageDto,
		'Read the leader-only professional governance audit',
	)
	audit(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Query() q: GroupPageQuery,
	) {
		return this.groups.audits(req.user.sub, id, q);
	}
}
