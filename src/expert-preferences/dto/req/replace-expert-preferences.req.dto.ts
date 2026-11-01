import { ApiProperty } from '@nestjs/swagger';
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
} from 'class-validator';
import { CATALOG_VERSION_PATTERN } from '../../preferences.validation';

export class ExpertPreferenceItemDto {
	@ApiProperty({
		description: 'Current DASS21 question identity',
		example: 'DASS21-Q01',
		pattern: '^DASS21-Q(0[1-9]|1[0-9]|2[01])$',
	})
	@IsString()
	@Matches(/^DASS21-Q(0[1-9]|1[0-9]|2[01])$/)
	dass21Id: string;
	@ApiProperty({
		description:
			'Depression percentage; D/A/S for this question must total exactly 100',
		example: 40,
		minimum: 0,
		maximum: 100,
		type: 'integer',
	})
	@IsInt()
	@Min(0)
	@Max(100)
	percentDepression: number;
	@ApiProperty({
		description: 'Anxiety percentage for this question',
		example: 35,
		minimum: 0,
		maximum: 100,
		type: 'integer',
	})
	@IsInt()
	@Min(0)
	@Max(100)
	percentAnxiety: number;
	@ApiProperty({
		description: 'Stress percentage for this question',
		example: 25,
		minimum: 0,
		maximum: 100,
		type: 'integer',
	})
	@IsInt()
	@Min(0)
	@Max(100)
	percentStress: number;
}
export class ReplaceExpertPreferencesDto {
	@ApiProperty({
		description:
			'Reference release reviewed by the expert, from GET /references/dass21',
		example: 'prototype-candidate-v1',
		maxLength: 64,
	})
	@IsString()
	@Matches(CATALOG_VERSION_PATTERN)
	catalogVersion: string;
	@ApiProperty({
		description:
			'Opaque comparison hash returned by the owner GET endpoint; not an authentication token',
		example: 'a'.repeat(64),
		pattern: '^[a-f0-9]{64}$',
	})
	@IsString()
	@Matches(/^[a-f0-9]{64}$/)
	expectedStateHash: string;
	@ApiProperty({
		description:
			'Complete set of 21 distinct question groups; all 63 values are mandatory',
		type: [ExpertPreferenceItemDto],
		minItems: 21,
		maxItems: 21,
	})
	@IsArray()
	@ArrayMinSize(21)
	@ArrayMaxSize(21)
	@ValidateNested({ each: true })
	@Type(() => ExpertPreferenceItemDto)
	preferences: ExpertPreferenceItemDto[];
}
