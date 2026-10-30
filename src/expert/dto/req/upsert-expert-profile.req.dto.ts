import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsDefined,
	IsEnum,
	IsInt,
	IsObject,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { Education } from '../../../prisma/generated/enums';

export class ExpertCapabilityDto {
	@ApiProperty({
		description: 'Highest supported completed education level',
		enum: Education,
		example: 'MASTER',
	})
	@IsEnum(Education)
	education: Education;
	@ApiProperty({
		description:
			'Number of published publications; submissions still under review do not count',
		example: 0,
		minimum: 0,
		maximum: 2147483647,
	})
	@IsInt()
	@Min(0)
	@Max(2147483647)
	publicationsNumber: number;
	@ApiProperty({
		description:
			'Clinical patient visits/sessions; the same patient may count in separate visits',
		example: 0,
		minimum: 0,
		maximum: 2147483647,
	})
	@IsInt()
	@Min(0)
	@Max(2147483647)
	patientsNumber: number;
	@ApiProperty({
		description:
			'Accumulated integer clinical practice/service hours, never inferred from years',
		example: 1200,
		minimum: 0,
		maximum: 2147483647,
	})
	@IsInt()
	@Min(0)
	@Max(2147483647)
	clinicalHours: number;
}
export class ExpertFactorWeightsDto {
	@ApiProperty({
		description:
			'Education percentage; four factors must total exactly 100',
		example: 25,
		minimum: 0,
		maximum: 100,
	})
	@IsInt()
	@Min(0)
	@Max(100)
	educationWeight: number;
	@ApiProperty({
		description: 'Published-publication percentage',
		example: 25,
		minimum: 0,
		maximum: 100,
	})
	@IsInt()
	@Min(0)
	@Max(100)
	publicationWeight: number;
	@ApiProperty({
		description: 'Patient/service count percentage',
		example: 25,
		minimum: 0,
		maximum: 100,
	})
	@IsInt()
	@Min(0)
	@Max(100)
	patientWeight: number;
	@ApiProperty({
		description: 'Clinical-hours percentage, distinct from raw hours',
		example: 25,
		minimum: 0,
		maximum: 100,
	})
	@IsInt()
	@Min(0)
	@Max(100)
	clinicalHoursWeight: number;
}
export class UpsertExpertProfileDto {
	@ApiProperty({
		description:
			'Current profile version; zero before first validated submission',
		example: 0,
		minimum: 0,
		maximum: 2147483646,
	})
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVersion: number;
	@ApiProperty({
		description: 'Complete four-value capability profile',
		type: ExpertCapabilityDto,
	})
	@IsDefined()
	@IsObject()
	@ValidateNested()
	@Type(() => ExpertCapabilityDto)
	profile: ExpertCapabilityDto;
	@ApiProperty({
		description:
			'Complete four-factor QDSS weights; exact integer total 100',
		type: ExpertFactorWeightsDto,
	})
	@IsDefined()
	@IsObject()
	@ValidateNested()
	@Type(() => ExpertFactorWeightsDto)
	weights: ExpertFactorWeightsDto;
}
