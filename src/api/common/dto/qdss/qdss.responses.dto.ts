import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QdssAnswerDto } from './qdss.requests.dto';
export class QdssSampleResponseDto {
	@ApiProperty() position!: number;
	@ApiProperty({ type: () => [QdssAnswerDto] }) answers!: QdssAnswerDto[];
}
export class QdssDatasetResponseDto {
	@ApiProperty({ enum: ['GLOBAL', 'GROUP', 'UNINITIALIZED'] })
	source!: string;
	@ApiProperty({ type: String, nullable: true }) revisionId!: string | null;
	@ApiPropertyOptional() version?: number;
	@ApiProperty() sampleCount!: number;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty() stateHash!: string;
	@ApiProperty() page!: number;
	@ApiProperty() limit!: number;
	@ApiProperty() hasNext!: boolean;
	@ApiProperty({ type: () => [QdssSampleResponseDto] })
	items!: QdssSampleResponseDto[];
}
export class QdssDatasetSavedDto {
	@ApiProperty() id!: string;
	@ApiProperty() version!: number;
	@ApiProperty() sampleCount!: number;
	@ApiProperty() stateHash!: string;
}
export class QdssInitializationDto {
	@ApiProperty() configurationId!: string;
	@ApiProperty() referenceId!: string;
	@ApiProperty() initialized!: boolean;
}
export class QdssRunResponseDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty() configurationId!: string;
	@ApiProperty({ format: 'uuid' }) datasetId!: string;
	@ApiProperty({ type: String, nullable: true }) referenceId!: string | null;
	@ApiProperty({ enum: ['RUNNING', 'SUCCEEDED', 'FAILED', 'STALE'] })
	status!: string;
	@ApiProperty() algorithmVersion!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	completedAt!: Date | null;
	@ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
}
export class QdssInfluenceDto {
	@ApiProperty() contributorId!: string;
	@ApiProperty({ minimum: 0, maximum: 1 }) weight!: number;
}
export class QdssActiveModelDto extends QdssRunResponseDto {
	@ApiProperty({ type: () => [QdssInfluenceDto] })
	weights!: QdssInfluenceDto[];
}
export class QdssModelResponseDto {
	@ApiProperty() configurationId!: string;
	@ApiProperty({
		enum: ['UNINITIALIZED', 'CURRENT', 'STALE_INPUT', 'INELIGIBLE'],
	})
	readiness!: string;
	@ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE'] })
	nextCalibrationStatus!: string;
	@ApiProperty({ type: String, nullable: true }) nextInputHash!:
		string | null;
	@ApiProperty({ type: () => QdssActiveModelDto, nullable: true })
	model!: QdssActiveModelDto | null;
}
