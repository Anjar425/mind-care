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
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { GroupsService } from '../../../domain/groups/groups.service';
import {
	EmptyGroupDecisionDto,
	GroupPageQuery,
	GroupStateDto,
	InviteGroupDto,
} from '../../common/dto/groups/group-requests.dto';
import {
	GroupInvitationDto,
	GroupInvitationsPageDto,
} from '../../common/dto/groups/group-responses.dto';
import { GroupResponse } from '../../common/dto/groups/group-api.decorator';
import { PositiveIntIdPipe } from '../../common/pipes/positive-int-id.pipe';

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
		@Param('groupId', PositiveIntIdPipe) id: number,
		@Body() dto: InviteGroupDto,
	) {
		return this.groups.invite(req.user.sub, id, dto);
	}
	@Get('group-invitations')
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
		@Param('groupId', PositiveIntIdPipe) id: number,
		@Query() q: GroupPageQuery,
	) {
		return this.groups.invitations(req.user.sub, q, id);
	}
	@Post('group-invitations/:invitationId/accept')
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
	@Post('group-invitations/:invitationId/decline')
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
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('invitationId', new ParseUUIDPipe()) id: string,
		@Body() dto: GroupStateDto,
	) {
		return this.groups.revokeInvitation(req.user.sub, groupId, id, dto);
	}
}
