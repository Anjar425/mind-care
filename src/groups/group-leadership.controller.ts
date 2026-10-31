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
	TransferGroupDto,
} from './dto/group-requests.dto';
import {
	GroupTransferDto,
	GroupTransfersPageDto,
} from './dto/group-responses.dto';
import { GroupResponse } from './group-api.decorator';

@ApiTags('Group leadership')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert')
export class GroupLeadershipController {
	constructor(private readonly groups: GroupsService) {}
	@Post('groups/:groupId/leadership-transfers')
	@GroupResponse(
		GroupTransferDto,
		'Propose transfer to a valid active member; verified leader recovery permitted',
		true,
	)
	propose(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Body() dto: TransferGroupDto,
	) {
		return this.groups.proposeTransfer(req.user.sub, id, dto);
	}
	@Get('me/group-leadership-transfers')
	@GroupResponse(GroupTransfersPageDto, 'Read your leadership transfer inbox')
	inbox(@Req() req: { user: AccessPrincipal }, @Query() q: GroupPageQuery) {
		return this.groups.transfers(req.user.sub, q);
	}
	@Get('groups/:groupId/leadership-transfers')
	@GroupResponse(
		GroupTransfersPageDto,
		'Read leadership grants as the current leader',
	)
	outbox(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) id: number,
		@Query() q: GroupPageQuery,
	) {
		return this.groups.transfers(req.user.sub, q, id);
	}
	@Post('me/group-leadership-transfers/:transferId/accept')
	@HttpCode(200)
	@GroupResponse(
		GroupTransferDto,
		'Accept unchanged leadership grant atomically; current valid credentials required',
	)
	accept(
		@Req() req: { user: AccessPrincipal },
		@Param('transferId', new ParseUUIDPipe()) id: string,
		@Body() _dto: EmptyGroupDecisionDto,
	) {
		void _dto;
		return this.groups.decideTransfer(req.user.sub, id, true);
	}
	@Post('me/group-leadership-transfers/:transferId/decline')
	@HttpCode(200)
	@GroupResponse(GroupTransferDto, 'Decline an addressed leadership grant')
	decline(
		@Req() req: { user: AccessPrincipal },
		@Param('transferId', new ParseUUIDPipe()) id: string,
		@Body() _dto: EmptyGroupDecisionDto,
	) {
		void _dto;
		return this.groups.decideTransfer(req.user.sub, id, false);
	}
	@Post('groups/:groupId/leadership-transfers/:transferId/revoke')
	@HttpCode(200)
	@GroupResponse(
		GroupTransferDto,
		'Revoke a pending or stale leadership grant; verified leader recovery permitted',
	)
	revoke(
		@Req() req: { user: AccessPrincipal },
		@Param('groupId', ParseIntPipe) groupId: number,
		@Param('transferId', new ParseUUIDPipe()) id: string,
		@Body() dto: GroupStateDto,
	) {
		return this.groups.revokeTransfer(req.user.sub, groupId, id, dto);
	}
}
