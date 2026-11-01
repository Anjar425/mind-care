import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsIn,
	IsInt,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

export class GroupPageQuery {
	@ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(10000)
	page: number = 1;
	@ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number = 10;
}
export class EmptyGroupDecisionDto {}
export class PublicGroupQuery extends GroupPageQuery {
	@ApiPropertyOptional({
		enum: ['updatedAt', 'memberCount'],
		default: 'updatedAt',
		description:
			'Unique screening-user sorting is deferred until privacy design.',
	})
	@IsIn(['updatedAt', 'memberCount'])
	sort: 'updatedAt' | 'memberCount' = 'updatedAt';
	@ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
	@IsIn(['asc', 'desc'])
	order: 'asc' | 'desc' = 'desc';
}
export class CreateGroupDto {
	@ApiProperty({
		maxLength: 120,
		description:
			'Published verbatim when the group is eligible. Do not include personal or patient information.',
	})
	@IsString()
	@MaxLength(120)
	@Matches(/\S/u)
	name!: string;
	@ApiProperty({
		maxLength: 2000,
		description: 'Public description; text is not silently normalized.',
	})
	@IsString()
	@MaxLength(2000)
	@Matches(/\S/u)
	description!: string;
}
export class GroupStateDto {
	@ApiProperty({
		pattern: '^[a-f0-9]{64}$',
		description: 'stateHash from the latest private group GET.',
	})
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash!: string;
}
export class UpdateGroupDto extends CreateGroupDto {
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash!: string;
}
export class ReasonedGroupDto extends GroupStateDto {
	@ApiProperty({
		maxLength: 1000,
		description:
			'Governance reason, visible to the leader through the audit; never include patient information.',
	})
	@IsString()
	@MaxLength(1000)
	@Matches(/\S/u)
	reason!: string;
}
export class InviteGroupDto extends GroupStateDto {
	@ApiProperty({
		format: 'uuid',
		description:
			'An existing EXPERT account ID. In-app delivery, expires after seven days.',
	})
	@IsUUID()
	recipientUserId!: string;
}
export class TransferGroupDto extends GroupStateDto {
	@ApiProperty({
		format: 'uuid',
		description:
			'A different active member with valid credentials; explicit acceptance is required.',
	})
	@IsUUID()
	targetExpertId!: string;
}
