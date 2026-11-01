import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	RuleConflictStatus,
	RuleResolutionKind,
} from '../../prisma/generated/enums';
import { CreateRuleDto } from '../../rules/dto/rule-requests.dto';

export class ConflictPageQuery {
	@ApiPropertyOptional({ default: 1, maximum: 10000 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(10000)
	page: number = 1;
	@ApiPropertyOptional({ default: 10, maximum: 100 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number = 10;
}
export class ConflictListQuery extends ConflictPageQuery {
	@ApiPropertyOptional({ enum: RuleConflictStatus, default: 'OPEN' })
	@IsEnum(RuleConflictStatus)
	status: RuleConflictStatus = 'OPEN';
}
export class ConflictInboxQuery extends ConflictPageQuery {
	@ApiPropertyOptional({ enum: ['all', 'unread', 'read'], default: 'all' })
	@IsIn(['all', 'unread', 'read'])
	read: 'all' | 'unread' | 'read' = 'all';
}
export class RefreshConflictsDto {
	@ApiPropertyOptional({ pattern: '^[a-f0-9]{64}$' })
	@IsOptional()
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedSourceHash?: string;
}
export class ResolutionActionDto {
	@ApiProperty({ minimum: 1, maximum: 2147483647 })
	@IsInt()
	@Min(1)
	@Max(2147483647)
	ruleId!: number;
	@ApiProperty({ format: 'uuid' }) @IsUUID() expectedRevisionId!: string;
	@ApiProperty({ enum: RuleResolutionKind })
	@IsEnum(RuleResolutionKind)
	type!: RuleResolutionKind;
	@ApiPropertyOptional({
		type: () => CreateRuleDto,
		description: 'Required only for REVISE. ARCHIVE must omit content.',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => CreateRuleDto)
	content?: CreateRuleDto;
}
export class CreateResolutionDto {
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedCaseStateHash!: string;
	@ApiProperty({ type: () => [ResolutionActionDto], minItems: 1 })
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => ResolutionActionDto)
	actions!: ResolutionActionDto[];
	@ApiProperty({
		maxLength: 1000,
		description: 'Professional rationale only; no patient information.',
	})
	@IsString()
	@MaxLength(1000)
	@Matches(/\S/u)
	reason!: string;
}
export class ConsentDto {
	@ApiProperty({
		pattern: '^[a-f0-9]{64}$',
		description:
			'Exact immutable planDigest being reviewed, never a client grant of authority.',
	})
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	planDigest!: string;
}
export class ReasonedConsentDto extends ConsentDto {
	@ApiProperty({ maxLength: 1000 })
	@IsString()
	@MaxLength(1000)
	@Matches(/\S/u)
	reason!: string;
}
export class EmptyConflictDto {}
