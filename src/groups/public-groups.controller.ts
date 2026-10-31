import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GroupEligibilityService } from './group-eligibility.service';
import { PublicGroupQuery } from './dto/group-requests.dto';
import { PublicGroupDto, PublicGroupsPageDto } from './dto/group-responses.dto';
import { GroupResponse } from './group-api.decorator';

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
