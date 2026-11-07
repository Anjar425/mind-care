import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY, SEVERITY } from '../../prisma/generated/enums';
import { CreateRuleDto } from './rule-requests.dto';

export class RuleSummaryDto {
	@ApiProperty() id!: number;
	@ApiProperty() groupId!: number;
	@ApiProperty() authorExpertId!: string;
	@ApiProperty() authorName!: string;
	@ApiProperty({ minimum: 1 }) version!: number;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty({ enum: CATEGORY }) category!: CATEGORY;
	@ApiProperty({ enum: SEVERITY }) severity!: SEVERITY;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	archivedAt!: Date | null;
}
export class RuleDetailDto extends RuleSummaryDto {
	@ApiProperty() grammarVersion!: string;
	@ApiProperty() canonicalVersion!: string;
	@ApiProperty({
		type: () => CreateRuleDto,
		description:
			'Preserved ordered authored content; syntax validity is not clinical validation, conflict approval or screening readiness.',
	})
	content!: CreateRuleDto;
	@ApiProperty({
		description: 'Current comparison state; never an authorization token.',
	})
	stateHash!: string;
}
export class RuleRevisionDetailDto {
	@ApiProperty() ruleId!: number;
	@ApiProperty() revisionId!: string;
	@ApiProperty() version!: number;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty() grammarVersion!: string;
	@ApiProperty() canonicalVersion!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: () => CreateRuleDto }) content!: CreateRuleDto;
}
export class RuleRevisionSummaryDto {
	@ApiProperty() ruleId!: number;
	@ApiProperty() revisionId!: string;
	@ApiProperty() version!: number;
	@ApiProperty() catalogVersion!: string;
	@ApiProperty() grammarVersion!: string;
	@ApiProperty() canonicalVersion!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ enum: CATEGORY }) category!: CATEGORY;
	@ApiProperty({ enum: SEVERITY }) severity!: SEVERITY;
}
export class RulesPageDto {
	@ApiProperty() page!: number;
	@ApiProperty() limit!: number;
	@ApiProperty() hasNext!: boolean;
	@ApiProperty({ type: () => [RuleSummaryDto] }) items!: RuleSummaryDto[];
}
export class RuleRevisionsPageDto {
	@ApiProperty() page!: number;
	@ApiProperty() limit!: number;
	@ApiProperty() hasNext!: boolean;
	@ApiProperty({ type: () => [RuleRevisionSummaryDto] })
	items!: RuleRevisionSummaryDto[];
}
