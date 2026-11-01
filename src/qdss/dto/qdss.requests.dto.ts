import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsInt,
	IsString,
	Matches,
	Max,
	Min,
	ValidateNested,
	IsOptional,
	IsUUID,
} from 'class-validator';
export class QdssAnswerDto {
	@ApiProperty({ example: 'DASS21-Q01' }) @IsString() dass21Id!: string;
	@ApiProperty({ minimum: 0, maximum: 3, example: 1 })
	@IsInt()
	@Min(0)
	@Max(3)
	score!: number;
}
export class QdssSampleDto {
	@ApiProperty({ type: () => [QdssAnswerDto], minItems: 21, maxItems: 21 })
	@IsArray()
	@ArrayMinSize(21)
	@ArrayMaxSize(21)
	@ValidateNested({ each: true })
	@Type(() => QdssAnswerDto)
	answers!: QdssAnswerDto[];
}
export class QdssDatasetDto {
	@ApiProperty({ example: 'prototype-reference-v1' })
	@IsString()
	@Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
	catalogVersion!: string;
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash!: string;
	@ApiProperty({ type: () => [QdssSampleDto], minItems: 20, maxItems: 100 })
	@IsArray()
	@ArrayMinSize(20)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => QdssSampleDto)
	samples!: QdssSampleDto[];
}
export class QdssRunDto {
	@ApiProperty({ pattern: '^[a-f0-9]{64}$' })
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedInputHash!: string;
}
export class QdssPageQuery {
	@ApiPropertyOptional({ default: 1, maximum: 10000 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(10000)
	page = 1;
	@ApiPropertyOptional({ default: 20, maximum: 100 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;
	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	revisionId?: string;
}
export class EmptyQdssDto {}
