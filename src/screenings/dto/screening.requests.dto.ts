import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	Matches,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
export class QdssScreeningAnswerDto {
	@ApiProperty({
		example: 'DASS21-Q01',
		description: 'Unique current DASS21 question ID.',
	})
	@IsString()
	@Matches(/^DASS21-Q(0[1-9]|1[0-9]|2[01])$/)
	dass21Id!: string;
	@ApiProperty({
		minimum: 0,
		maximum: 3,
		description:
			'Original integer score; strings/booleans are not coerced.',
	})
	@IsInt()
	@Min(0)
	@Max(3)
	score!: number;
}
export class Dass42ScreeningAnswerDto {
	@ApiProperty({
		example: 'DASS42-Q01',
		description: 'Unique current DASS42 question ID.',
	})
	@IsString()
	@Matches(/^DASS42-Q(0[1-9]|[1-3][0-9]|4[0-2])$/)
	dass42Id!: string;
	@ApiProperty({
		minimum: 0,
		maximum: 3,
		example: 1.5,
		description:
			'Original finite numeric0–3 value; fractional scores retained.',
	})
	@IsNumber({ allowNaN: false, allowInfinity: false })
	@Min(0)
	@Max(3)
	score!: number;
}
export class QdssScreeningDto {
	@ApiProperty({
		description:
			'Version from the current public DASS21 reference catalog.',
		maxLength: 64,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
	catalogVersion!: string;
	@ApiProperty({
		enum: ['GLOBAL', 'GROUP'],
		description:
			'Explicit source selection; GROUP failure never falls back to GLOBAL.',
	})
	@IsIn(['GLOBAL', 'GROUP'])
	scope!: 'GLOBAL' | 'GROUP';
	@ApiPropertyOptional({
		minimum: 1,
		maximum: 2147483647,
		description: 'Required for GROUP; must be absent for GLOBAL.',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(2147483647)
	declare groupId?: number;
	@ApiProperty({
		type: () => [QdssScreeningAnswerDto],
		minItems: 21,
		maxItems: 21,
	})
	@IsArray()
	@ArrayMinSize(21)
	@ArrayMaxSize(21)
	@ValidateNested({ each: true })
	@Type(() => QdssScreeningAnswerDto)
	answers!: QdssScreeningAnswerDto[];
}
export class Dass42ScreeningDto {
	@ApiProperty({
		description:
			'Version from the current public DASS42 reference catalog.',
		maxLength: 64,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
	catalogVersion!: string;
	@ApiProperty({
		minimum: 1,
		maximum: 2147483647,
		description: 'Currently eligible public group; no GLOBAL DASS42 mode.',
	})
	@IsInt()
	@Min(1)
	@Max(2147483647)
	groupId!: number;
	@ApiProperty({
		type: () => [Dass42ScreeningAnswerDto],
		minItems: 42,
		maxItems: 42,
	})
	@IsArray()
	@ArrayMinSize(42)
	@ArrayMaxSize(42)
	@ValidateNested({ each: true })
	@Type(() => Dass42ScreeningAnswerDto)
	answers!: Dass42ScreeningAnswerDto[];
}
