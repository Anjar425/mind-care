import { ApiProperty } from '@nestjs/swagger';
import { Education } from '../../../prisma/generated/enums';

export class ExpertCapabilityResDto {
	@ApiProperty({
		description: 'Supported education level; null until supplied',
		enum: Education,
		example: 'MASTER',
		nullable: true,
		type: String,
	})
	education: Education | null;
	@ApiProperty({
		description:
			'Published publications; null means missing, zero is valid',
		type: Number,
		example: 0,
		nullable: true,
	})
	publicationsNumber: number | null;
	@ApiProperty({
		description:
			'Patient visits/sessions, allowing repeat patients; null means missing',
		type: Number,
		example: 0,
		nullable: true,
	})
	patientsNumber: number | null;
	@ApiProperty({
		description:
			'Accumulated integer clinical hours; null never means zero',
		type: Number,
		example: 1200,
		nullable: true,
	})
	clinicalHours: number | null;
}
export class ExpertWeightsResDto {
	@ApiProperty({ description: 'Submitted education percentage', example: 25 })
	educationWeight: number;
	@ApiProperty({
		description: 'Submitted publication percentage',
		example: 25,
	})
	publicationWeight: number;
	@ApiProperty({
		description: 'Submitted patient/service percentage',
		example: 25,
	})
	patientWeight: number;
	@ApiProperty({
		description:
			'Submitted clinical-hours percentage; legacy absence is null',
		type: Number,
		example: 25,
		nullable: true,
	})
	clinicalHoursWeight: number | null;
}
export class ExpertProfileResDto {
	@ApiProperty({ description: 'Profile concurrency version', example: 1 })
	version: number;
	@ApiProperty({
		description:
			'Last full-contract validation time; technical validation, not clinical approval',
		type: Date,
		example: '2026-10-30T00:00:00Z',
		nullable: true,
	})
	validatedAt: Date | null;
	@ApiProperty({
		description:
			'Owned capability metrics; null before an Expert row exists',
		type: ExpertCapabilityResDto,
		nullable: true,
	})
	profile: ExpertCapabilityResDto | null;
	@ApiProperty({
		description: 'Owned four-factor weights; null before submission',
		type: ExpertWeightsResDto,
		nullable: true,
	})
	weights: ExpertWeightsResDto | null;
	@ApiProperty({
		description:
			'Profile is complete under the current submission contract; not full expert/group validity',
		example: true,
	})
	profileComplete: boolean;
	@ApiProperty({
		description: 'Weights are validated integers totaling exactly 100',
		example: true,
	})
	weightsComplete: boolean;
}
