import {
	Body,
	Controller,
	Get,
	HttpCode,
	Param,
	ParseIntPipe,
	ParseUUIDPipe,
	Post,
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
import {
	EmptyGroupDecisionDto,
	GroupPageQuery,
	GroupStateDto,
	InviteGroupDto,
} from './dto/group-requests.dto';
import {
	GroupInvitationDto,
	GroupInvitationsPageDto,
} from './dto/group-responses.dto';
import { GroupResponse } from './group-api.decorator';

@ApiTags('Group invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert')
export class GroupInvitationsController {
	constructor(private readonly groups: GroupsService) {}
	@Post('groups/:groupId/invitations')
	@GroupResponse(
		GroupInvitationDto,
		'Invite a specific EXPERT account for seven days; valid leader credentials required',
		true,
	)
	invite(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Body() dto: InviteGroupDto,
	) {
		return this.groups.invite(req.user.sub, id, dto);
	}
	@Get('me/group-invitations')
	@GroupResponse(
		GroupInvitationsPageDto,
		'Read your addressed invitation inbox',
	)
	inbox(@Req() req: { user: AccessPrincipal }, @Query() q: GroupPageQuery) {
		return this.groups.invitations(req.user.sub, q);
	}
	@Get('groups/:groupId/invitations')
	@GroupResponse(
		GroupInvitationsPageDto,
		'Read the group invitation outbox as its current leader',
	)
	outbox(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Query() q: GroupPageQuery,
	) {
		return this.groups.invitations(req.user.sub, q, id);
	}
	@Post('me/group-invitations/:invitationId/accept')
	@HttpCode(200)
	@GroupResponse(
		GroupInvitationDto,
		'Accept your single-use invitation; current valid credentials required',
	)
	accept(
		@Req() req: { user: AccessPrincipal },
		@Param('invitationId', new ParseUUIDPipe()) id: string,
		@Body() _dto: EmptyGroupDecisionDto,
	) {
		void _dto;
		return this.groups.decideInvitation(req.user.sub, id, true);
	}
	@Post('me/group-invitations/:invitationId/decline')
	@HttpCode(200)
	@GroupResponse(
		GroupInvitationDto,
		'Decline your invitation without changing membership',
	)
	decline(
		@Req() req: { user: AccessPrincipal },
		@Param('invitationId', new ParseUUIDPipe()) id: string,
		@Body() _dto: EmptyGroupDecisionDto,
	) {
		void _dto;
		return this.groups.decideInvitation(req.user.sub, id, false);
	}
	@Post('groups/:groupId/invitations/:invitationId/revoke')
	@HttpCode(200)
	@GroupResponse(
		GroupInvitationDto,
		'Revoke a pending invitation; verified leader recovery permitted',
	)
	revoke(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) groupId: number,
		@Param('invitationId', new ParseUUIDPipe()) id: string,
		@Body() dto: GroupStateDto,
	) {
		return this.groups.revokeInvitation(req.user.sub, groupId, id, dto);
	}
}
