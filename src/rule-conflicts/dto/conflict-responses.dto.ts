import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RuleRevisionDetailDto } from '../../rules/dto/rule-responses.dto';
import { CreateRuleDto } from '../../rules/dto/rule-requests.dto';
import {
	CATEGORY,
	RuleConflictStatus,
	RuleProposalStatus,
	RuleResolutionKind,
	RuleConsent,
} from '../../prisma/generated/enums';

export class ConflictSummaryDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty() groupId!: number;
	@ApiProperty({ enum: CATEGORY }) category!: string;
	@ApiProperty({ enum: RuleConflictStatus }) status!: string;
	@ApiProperty() ruleCount!: number;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	closedAt!: Date | null;
}
export class ConflictMemberDto extends RuleRevisionDetailDto {
	@ApiProperty({ format: 'uuid' }) authorExpertId!: string;
}
export class ConflictDetailDto extends ConflictSummaryDto {
	@ApiProperty() sourceHash!: string;
	@ApiProperty() comparisonVersion!: string;
	@ApiProperty({
		type: 'array',
		items: {},
		description:
			'Versioned normalized antecedent tree; ordered authored content is preserved separately.',
	})
	normalized!: unknown[];
	@ApiProperty() stateHash!: string;
	@ApiProperty() current!: boolean;
	@ApiProperty({ type: () => [ConflictMemberDto] })
	members!: ConflictMemberDto[];
}
export class PageDto {
	@ApiProperty() page!: number;
	@ApiProperty() limit!: number;
	@ApiProperty() hasNext!: boolean;
}
export class ConflictSummariesPageDto extends PageDto {
	@ApiProperty({ type: () => [ConflictSummaryDto] })
	items!: ConflictSummaryDto[];
}
export class ConflictPageDto extends ConflictSummariesPageDto {
	@ApiProperty() sourceHash!: string;
	@ApiProperty() comparisonVersion!: string;
	@ApiProperty() currentConflictCount!: number;
	@ApiProperty({ enum: ['CURRENT', 'STALE', 'UNASSESSED'] })
	assessment!: string;
	@ApiProperty() requiresRefresh!: boolean;
}
export class ConflictRefreshDto {
	@ApiProperty({ format: 'uuid' }) assessmentId!: string;
	@ApiProperty() sourceHash!: string;
	@ApiProperty() comparisonVersion!: string;
	@ApiProperty() currentConflictCount!: number;
	@ApiProperty({ type: [String] }) caseIds!: string[];
}
export class ResolutionActionResponseDto {
	@ApiProperty() ruleId!: number;
	@ApiProperty({ format: 'uuid' }) revisionId!: string;
	@ApiProperty({ enum: RuleResolutionKind }) type!: string;
	@ApiProperty({ type: () => CreateRuleDto, nullable: true })
	content!: CreateRuleDto | null;
}
export class ResolutionDecisionDto {
	@ApiProperty({ enum: RuleConsent }) value!: string;
	@ApiProperty({ type: String, nullable: true }) reason!: string | null;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class ResolutionParticipantDto {
	@ApiProperty({ format: 'uuid' }) expertId!: string;
	@ApiProperty({ type: () => ResolutionDecisionDto, nullable: true })
	decision!: ResolutionDecisionDto | null;
}
export class ResolutionDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({ format: 'uuid' }) caseId!: string;
	@ApiProperty({ format: 'uuid' }) proposerUserId!: string;
	@ApiProperty() planDigest!: string;
	@ApiProperty() reason!: string;
	@ApiProperty({ enum: RuleProposalStatus }) status!: string;
	@ApiProperty({ enum: RuleProposalStatus }) effectiveStatus!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	decidedAt!: Date | null;
	@ApiProperty({ type: () => [ResolutionActionResponseDto] })
	actions!: ResolutionActionResponseDto[];
	@ApiProperty({ type: () => [ResolutionParticipantDto] })
	participants!: ResolutionParticipantDto[];
}
export class ResolutionCancellationDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({ enum: ['CANCELLED'] }) status!: string;
}
export class ConflictAuditDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty() event!: string;
	@ApiProperty({ type: String, nullable: true }) proposalId!: string | null;
	@ApiProperty({ format: 'uuid' }) actorUserId!: string;
	@ApiProperty({ type: String, nullable: true }) reason!: string | null;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class ConflictAuditPageDto extends PageDto {
	@ApiProperty({ type: () => [ConflictAuditDto] }) items!: ConflictAuditDto[];
}
export class ConflictNoticeDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({ format: 'uuid' }) caseId!: string;
	@ApiProperty({ type: String, nullable: true }) proposalId!: string | null;
	@ApiProperty() type!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	readAt!: Date | null;
}
export class ConflictInboxPageDto extends PageDto {
	@ApiProperty({ type: () => [ConflictNoticeDto] })
	items!: ConflictNoticeDto[];
}
export class NoticeReadDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({ type: String, format: 'date-time' }) readAt!: Date;
}
export class ReminderDto {
	@ApiProperty({ format: 'uuid' }) caseId!: string;
	@ApiProperty({
		description:
			'New durable in-app records, not email or delivery confirmation.',
	})
	createdCount!: number;
	@ApiProperty({ enum: ['IN_APP'] }) channel!: string;
}
export class Dass42AssessmentDto {
	@ApiProperty() groupId!: number;
	@ApiProperty() commonEligible!: boolean;
	@ApiProperty({
		enum: ['BLOCKED', 'EMPTY', 'CONFLICTED', 'CONFLICT_FREE'],
		description:
			'Current snapshot only; never clinical validation or executable screening readiness.',
	})
	applicableStatus!: string;
	@ApiProperty() governanceConflictCount!: number;
	@ApiPropertyOptional() applicableConflictCount?: number;
	@ApiPropertyOptional() applicableRuleCount?: number;
	@ApiPropertyOptional() sourceHash?: string;
	@ApiPropertyOptional() comparisonVersion?: string;
	@ApiProperty({ type: String, format: 'date-time' }) evaluatedAt!: Date;
}
