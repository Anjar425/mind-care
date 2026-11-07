import { ApiProperty } from '@nestjs/swagger';
import { GUIDANCE_VERSION } from '../client/screening-presentation';
export class ScreeningGroupDto {
	@ApiProperty({ minimum: 1 }) id!: number;
	@ApiProperty({
		description:
			'Public group name captured in the same snapshot as computation.',
	})
	name!: string;
}
export class ScreeningPresentationDto {
	@ApiProperty({ enum: [GUIDANCE_VERSION] }) version!: string;
	@ApiProperty({
		description:
			'DASS42 only: Severe/Extremely Severe is a positive maximum in any category; ties count. Always false for QDSS.',
	})
	consultationRecommended!: boolean;
	@ApiProperty({
		enum: ['depression', 'anxiety', 'stress'],
		isArray: true,
		description:
			'Categories that triggered the message, not a cross-category severity ranking.',
	})
	qualifyingCategories!: string[];
	@ApiProperty({
		type: String,
		nullable: true,
		description:
			'Supportive non-diagnostic message, or null. No third-party notification.',
	})
	message!: string | null;
}
export class QdssResultDto {
	@ApiProperty({ minimum: 0, maximum: 1 }) depression!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) anxiety!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) stress!: number;
	@ApiProperty({
		type: String,
		enum: ['Normal', 'Mild', 'Moderate', 'Severe', 'Extremely Severe'],
		nullable: true,
		description:
			'Original Copy relative-share label, not standard clinical DASS severity. Null for all-zero contribution.',
	})
	copyHistoryLabel!: string | null;
}
export class MembershipDegreesDto {
	@ApiProperty({ minimum: 0, maximum: 1 }) Normal!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) Mild!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) Moderate!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) Severe!: number;
	@ApiProperty({ minimum: 0, maximum: 1 }) 'Extremely Severe'!: number;
}
export class Dass42CategoryDto {
	@ApiProperty({ enum: ['depression', 'anxiety', 'stress'] })
	category!: string;
	@ApiProperty({
		minimum: 0,
		maximum: 42,
		description:
			'Source centroid. Depression domain0..42; anxiety/stress0..41. Never rank these as interchangeable clinical scales.',
	})
	score!: number;
	@ApiProperty({
		type: () => MembershipDegreesDto,
		description:
			'All5 original memberships at the centroid, not probabilities.',
	})
	membership_degrees!: MembershipDegreesDto;
}
export class Dass42ResultDto {
	@ApiProperty({ type: () => Dass42CategoryDto })
	depression!: Dass42CategoryDto;
	@ApiProperty({ type: () => Dass42CategoryDto }) anxiety!: Dass42CategoryDto;
	@ApiProperty({ type: () => Dass42CategoryDto }) stress!: Dass42CategoryDto;
}
export class QdssContextDto {
	@ApiProperty({ enum: ['GLOBAL', 'GROUP'] }) scope!: string;
	@ApiProperty({ type: () => ScreeningGroupDto, nullable: true })
	group!: ScreeningGroupDto | null;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty() algorithmVersion!: string;
	@ApiProperty() modelRunId!: string;
	@ApiProperty() datasetRevisionId!: string;
}
export class Dass42ContextDto {
	@ApiProperty({ enum: ['GROUP'] }) scope!: string;
	@ApiProperty({ type: () => ScreeningGroupDto }) group!: ScreeningGroupDto;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty({
		description:
			'Original engineVersion, normalized only as a context field name.',
	})
	algorithmVersion!: string;
	@ApiProperty() configHash!: string;
	@ApiProperty() sourceHash!: string;
	@ApiProperty({ format: 'date-time' }) evaluatedAt!: string;
}
export class BaseScreeningResponseDto {
	@ApiProperty({
		type: String,
		nullable: true,
		description:
			'Authenticated account binding for safe client history orchestration; null for guests, no anonymous tracking ID.',
	})
	accountId!: string | null;
	@ApiProperty({
		enum: ['GUEST', 'ACCOUNT'],
		description:
			'Guest results must never enter the automatic history workflow.',
	})
	audience!: string;
	@ApiProperty({
		format: 'date-time',
		description:
			'Assessment timestamp, not model calibration creation time.',
	})
	assessedAt!: string;
	@ApiProperty({
		description: 'Screening support disclaimer, not a clinical diagnosis.',
	})
	disclaimer!: string;
	@ApiProperty({ type: () => ScreeningPresentationDto })
	presentation!: ScreeningPresentationDto;
}
export class QdssScreeningResponseDto extends BaseScreeningResponseDto {
	@ApiProperty({ enum: ['QDSS_DASS21'] }) instrument!: string;
	@ApiProperty({ type: () => QdssContextDto }) context!: QdssContextDto;
	@ApiProperty({ type: () => QdssResultDto }) result!: QdssResultDto;
}
export class Dass42ScreeningResponseDto extends BaseScreeningResponseDto {
	@ApiProperty({ enum: ['DASS42_MAMDANI'] }) instrument!: string;
	@ApiProperty({ type: () => Dass42ContextDto }) context!: Dass42ContextDto;
	@ApiProperty({ type: () => Dass42ResultDto }) result!: Dass42ResultDto;
}
