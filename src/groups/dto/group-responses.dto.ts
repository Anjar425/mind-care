import { ApiProperty } from '@nestjs/swagger';

export class GroupMetadataDto {
	@ApiProperty() id!: number;
	@ApiProperty() name!: string;
	@ApiProperty() description!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	archivedAt!: Date | null;
}
export class OwnGroupDto extends GroupMetadataDto {
	@ApiProperty({ enum: ['LEADER', 'MEMBER'] }) ownRole!: string;
	@ApiProperty() stateHash!: string;
}
export class GroupMemberDto {
	@ApiProperty() expertId!: string;
	@ApiProperty() name!: string;
	@ApiProperty({ enum: ['LEADER', 'MEMBER'] }) role!: string;
	@ApiProperty() isSelf!: boolean;
}
export class PrivateGroupDto extends OwnGroupDto {
	@ApiProperty({
		type: () => [GroupMemberDto],
		description:
			'Metadata roster only; use the separate eligibility endpoint for current validity.',
	})
	members!: GroupMemberDto[];
}
export class GroupPageDto {
	@ApiProperty() page!: number;
	@ApiProperty() limit!: number;
	@ApiProperty() hasNext!: boolean;
}
export class OwnGroupsPageDto extends GroupPageDto {
	@ApiProperty({ type: () => [OwnGroupDto] }) items!: OwnGroupDto[];
}
export class MembershipEndedDto extends GroupMetadataDto {
	@ApiProperty() expertId!: string;
	@ApiProperty({ enum: ['LEFT', 'REMOVED'] }) membershipStatus!: string;
}
export class GroupGrantDto {
	@ApiProperty() id!: string;
	@ApiProperty() groupId!: number;
	@ApiProperty({
		enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED'],
		description:
			'Effective expiry is computed on reads; reads never persist decisions.',
	})
	status!: string;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	decidedAt!: Date | null;
}
export class GroupInvitationDto extends GroupGrantDto {
	@ApiProperty() recipientUserId!: string;
}
export class GroupInvitationsPageDto extends GroupPageDto {
	@ApiProperty({ type: () => [GroupInvitationDto] })
	items!: GroupInvitationDto[];
}
export class GroupTransferDto extends GroupGrantDto {
	@ApiProperty() proposedByExpertId!: string;
	@ApiProperty() targetExpertId!: string;
}
export class GroupTransfersPageDto extends GroupPageDto {
	@ApiProperty({ type: () => [GroupTransferDto] }) items!: GroupTransferDto[];
}
export class GroupMemberEligibilityDto {
	@ApiProperty() expertId!: string;
	@ApiProperty() isSelf!: boolean;
	@ApiProperty() eligible!: boolean;
}
export class GroupEligibilityDto {
	@ApiProperty() groupId!: number;
	@ApiProperty({
		description:
			'Common publication eligibility only. Does not certify clinical validation or DASS42 rule/engine readiness.',
	})
	eligible!: boolean;
	@ApiProperty() activeMemberCount!: number;
	@ApiProperty() validExpertCount!: number;
	@ApiProperty({ example: 4 }) minimumValidExperts!: number;
	@ApiProperty({ type: String, format: 'date-time' }) evaluatedAt!: Date;
	@ApiProperty({ type: () => [GroupMemberEligibilityDto] })
	members!: GroupMemberEligibilityDto[];
}
export class PublicGroupDto {
	@ApiProperty() id!: number;
	@ApiProperty() name!: string;
	@ApiProperty() description!: string;
	@ApiProperty({
		description:
			'Distinct active professional members, including incomplete contributors.',
	})
	activeMemberCount!: number;
	@ApiProperty() validExpertCount!: number;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
	@ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
export class PublicGroupsPageDto extends GroupPageDto {
	@ApiProperty({ type: () => [PublicGroupDto] }) items!: PublicGroupDto[];
}
export class GroupAuditDto {
	@ApiProperty() id!: string;
	@ApiProperty({
		enum: [
			'CREATED',
			'METADATA_UPDATED',
			'INVITED',
			'INVITATION_ACCEPTED',
			'INVITATION_DECLINED',
			'INVITATION_REVOKED',
			'MEMBER_LEFT',
			'MEMBER_REMOVED',
			'TRANSFER_PROPOSED',
			'TRANSFER_ACCEPTED',
			'TRANSFER_DECLINED',
			'TRANSFER_REVOKED',
			'ARCHIVED',
		],
	})
	action!: string;
	@ApiProperty() actorUserId!: string;
	@ApiProperty({ type: String, nullable: true }) affectedExpertId!:
		| string
		| null;
	@ApiProperty({ type: String, nullable: true }) invitationId!: string | null;
	@ApiProperty({ type: String, nullable: true }) transferId!: string | null;
	@ApiProperty({ type: String, nullable: true }) reason!: string | null;
	@ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class GroupAuditsPageDto extends GroupPageDto {
	@ApiProperty({ type: () => [GroupAuditDto] }) items!: GroupAuditDto[];
}
