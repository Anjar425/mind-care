import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GroupEligibilityService } from '../../../domain/groups/group-eligibility.service';
import { PublicGroupQuery } from '../../common/dto/groups/group-requests.dto';
import {
	PublicGroupDto,
	PublicGroupsPageDto,
} from '../../common/dto/groups/group-responses.dto';
import { GroupResponse } from '../../common/dto/groups/group-api.decorator';

@ApiTags('Public groups')
@Controller('groups/public')
export class PublicGroupsController {
	constructor(private readonly eligibility: GroupEligibilityService) {}
	@Get()
	@GroupResponse(
		PublicGroupsPageDto,
		'List currently eligible groups; filter before pagination; no screening usage tracking',
		false,
		true,
	)
	list(@Query() q: PublicGroupQuery) {
		return this.eligibility.list(q);
	}
	@Get(':groupId')
	@GroupResponse(
		PublicGroupDto,
		'Read currently eligible group metadata; common eligibility is not clinical or engine certification',
		false,
		true,
	)
	detail(@Param('groupId', ParseIntPipe) id: number) {
		return this.eligibility.publicDetail(id);
	}
}
