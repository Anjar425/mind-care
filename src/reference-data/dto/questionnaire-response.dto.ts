import { ApiProperty } from '@nestjs/swagger';
import type { Instrument } from '../reference-data.types';

export class QuestionResponseDto {
	@ApiProperty({
		description: 'Stable question identity within its instrument',
		example: 'DASS21-Q01',
	})
	id!: string;

	@ApiProperty({
		description: 'Original one-based question number',
		example: 1,
	})
	number!: number;

	@ApiProperty({
		description: 'Unmodified candidate questionnaire text',
		example: 'Example questionnaire statement',
	})
	text!: string;
}

export class QuestionnaireResponseDto {
	@ApiProperty({
		description:
			'Questionnaire instrument, distinct from a screening result',
		enum: ['DASS21', 'DASS42'],
		example: 'DASS21',
	})
	instrument!: Instrument;

	@ApiProperty({
		description:
			'Technical catalog release; not a clinical approval or translation version',
		example: 'prototype-candidate-v1',
	})
	catalogVersion!: string;

	@ApiProperty({
		description: 'Complete questionnaire in original question order',
		type: [QuestionResponseDto],
	})
	questions!: QuestionResponseDto[];
}
