import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	CATEGORY,
	CONJUCTION,
	LEVEL,
	PREFIX,
	SEVERITY,
} from '../../prisma/generated/enums';

export class RulePremiseDto {
	@ApiProperty({ example: 'DASS42-Q13' })
	@IsString()
	@Matches(/^DASS42-Q(0[1-9]|[1-3][0-9]|4[0-2])$/)
	dass42Id!: string;
	@ApiProperty({ enum: PREFIX, example: 'NO_PREFIX' })
	@IsEnum(PREFIX)
	prefix!: PREFIX;
	@ApiProperty({ enum: LEVEL, example: 'LOW' }) @IsEnum(LEVEL) level!: LEVEL;
	@ApiProperty({
		enum: CONJUCTION,
		example: 'THEN',
		description:
			'Outgoing connector: AND/OR except on the final clause, which must be THEN.',
	})
	@IsEnum(CONJUCTION)
	joinToNext!: CONJUCTION;
}
export class RuleConclusionDto {
	@ApiProperty({ enum: CATEGORY, example: 'DEPRESSION' })
	@IsEnum(CATEGORY)
	category!: CATEGORY;
	@ApiProperty({ enum: SEVERITY, example: 'MODERATE' })
	@IsEnum(SEVERITY)
	severity!: SEVERITY;
}
export class CreateRuleDto {
	@ApiProperty({ example: 'prototype-candidate-v1' })
	@IsString()
	@Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
	catalogVersion!: string;
	@ApiProperty({ type: () => [RulePremiseDto], minItems: 1, maxItems: 100 })
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => RulePremiseDto)
	premises!: RulePremiseDto[];
	@ApiProperty({ type: () => RuleConclusionDto })
	@ValidateNested()
	@Type(() => RuleConclusionDto)
	conclusion!: RuleConclusionDto;
}
export class UpdateRuleDto extends CreateRuleDto {
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash!: string;
}
export class ArchiveRuleDto {
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash!: string;
	@ApiProperty({
		maxLength: 1000,
		description:
			'Professional withdrawal reason only; never include patient information.',
	})
	@IsString()
	@MaxLength(1000)
	@Matches(/\S/u)
	reason!: string;
}
export class RulesPageQuery {
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
export class RulesQuery extends RulesPageQuery {
	@ApiPropertyOptional({ enum: CATEGORY })
	@IsOptional()
	@IsEnum(CATEGORY)
	category?: CATEGORY;
	@ApiPropertyOptional({
		enum: ['active', 'archived', 'all'],
		default: 'active',
	})
	@IsIn(['active', 'archived', 'all'])
	lifecycle: 'active' | 'archived' | 'all' = 'active';
}
