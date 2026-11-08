import { ApiProperty } from '@nestjs/swagger';

export class StoredExpertPreferenceDto {
	@ApiProperty({ description: 'Question identity', example: 'DASS21-Q01' })
	dass21Id: string;
	@ApiProperty({
		description: 'Question release under which this vector was submitted',
		example: 'prototype-candidate-v1',
	})
	catalogVersion: string;
	@ApiProperty({
		description: 'Exact submitted depression percentage',
		example: 40,
		type: 'integer',
		minimum: 0,
		maximum: 100,
	})
	percentDepression: number;
	@ApiProperty({
		description: 'Exact submitted anxiety percentage',
		example: 35,
		type: 'integer',
		minimum: 0,
		maximum: 100,
	})
	percentAnxiety: number;
	@ApiProperty({
		description: 'Exact submitted stress percentage',
		example: 25,
		type: 'integer',
		minimum: 0,
		maximum: 100,
	})
	percentStress: number;
}
export class ExpertPreferencesResDto {
	@ApiProperty({
		description: 'Instrument configured by these vectors',
		example: 'DASS21',
		enum: ['DASS21'],
	})
	instrument: 'DASS21';
	@ApiProperty({
		description: 'Currently available question release',
		example: 'prototype-candidate-v1',
	})
	catalogVersion: string;
	@ApiProperty({
		description:
			'Current owner/reference/preference state digest; return as expectedStateHash when saving',
		example: 'a'.repeat(64),
	})
	stateHash: string;
	@ApiProperty({
		description:
			'Exactly 21 valid current-release vectors; does not imply full expert/group eligibility',
		example: true,
	})
	preferencesComplete: boolean;
	@ApiProperty({
		description:
			'Owned existing vectors in catalog order; empty before submission',
		type: [StoredExpertPreferenceDto],
		maxItems: 21,
	})
	preferences: StoredExpertPreferenceDto[];
}
