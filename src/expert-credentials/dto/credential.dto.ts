import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum ReviewDecision {
	APPROVE = 'APPROVE',
	REJECT = 'REJECT',
}
export class SubmitCredentialDto {
	@ApiProperty({
		description: 'Original credential number; preserved as submitted',
		example: 'STR-12345',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	number: string;
	@ApiProperty({
		description:
			'Document holder name; must exactly match the account name',
		example: 'Example Expert',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	holderName: string;
	@ApiProperty({
		description: 'Valid through this date, end of day Asia/Jakarta',
		example: '2027-12-12',
	})
	@Matches(/^\d{4}-\d{2}-\d{2}$/)
	expiryDate: string;
	@ApiProperty({
		description:
			'Current credential aggregate version; 0 before first submission',
		example: 0,
	})
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
			? Number(value)
			: value,
	)
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVersion: number;
}
export class ReviewCredentialDto {
	@ApiProperty({
		description: 'Approve or reject this exact immutable revision',
		enum: ReviewDecision,
		example: ReviewDecision.APPROVE,
	})
	@IsEnum(ReviewDecision)
	decision: ReviewDecision;
	@ApiProperty({
		description: 'Current credential aggregate version',
		example: 1,
	})
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVersion: number;
	@ApiProperty({
		description: 'SHA-256 of the exact downloaded document',
		example: 'a'.repeat(64),
	})
	@Matches(/^[a-f0-9]{64}$/)
	digest: string;
	@ApiProperty({
		description:
			'Reviewer has manually matched the name, number and expiry to this document. Must be true for approval.',
		example: true,
	})
	@IsBoolean()
	documentMatches: boolean;
	@ApiProperty({
		description:
			'Decision reason, without full credential numbers or unnecessary personal data',
		example: 'Document and submitted metadata match.',
	})
	@IsString()
	@Matches(/\S/)
	@MaxLength(500)
	reason: string;
}
export class CredentialActionDto {
	@ApiProperty({
		description: 'Current credential aggregate version',
		example: 2,
	})
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVersion: number;
	@ApiProperty({
		description: 'Reason for suspension or reinstatement',
		example: 'Credential revocation reported.',
	})
	@IsString()
	@Matches(/\S/)
	@MaxLength(500)
	reason: string;
}
export class CredentialQueueDto {
	@ApiPropertyOptional({
		description: 'Number of rows to skip',
		example: 0,
		default: 0,
	})
	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' && /^\d+$/.test(value)
			? Number(value)
			: value,
	)
	@IsInt()
	@Min(0)
	@Max(100000)
	skip = 0;
	@ApiPropertyOptional({
		description: 'Maximum pending rows',
		example: 20,
		default: 20,
	})
	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' && /^\d+$/.test(value)
			? Number(value)
			: value,
	)
	@IsInt()
	@Min(1)
	@Max(100)
	take = 20;
}

export class CredentialRevisionDto {
	@ApiProperty({
		description: 'Immutable revision identifier',
		example: '123e4567-e89b-42d3-a456-426614174000',
	})
	id: string;
	@ApiProperty({
		description: 'Credential kind',
		enum: ['STR', 'SIP'],
		example: 'STR',
	})
	type: string;
	@ApiProperty({
		description: 'Review state',
		enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'],
		example: 'PENDING',
	})
	status: string;
	@ApiProperty({
		description: 'Expiry date, inclusive in Asia/Jakarta',
		example: '2027-12-12',
	})
	expiryDate: string;
	@ApiProperty({
		description: 'Exclusive expiry boundary',
		example: '2027-12-12T17:00:00.000Z',
	})
	expiresAt: Date;
	@ApiProperty({
		description: 'Submission time',
		example: '2026-10-30T00:00:00Z',
	})
	submittedAt: Date;
	@ApiProperty({
		description: 'Document SHA-256 for exact review',
		example: 'a'.repeat(64),
	})
	digest: string;
	@ApiProperty({
		description: 'Whether document bytes are still retained',
		example: true,
	})
	documentAvailable: boolean;
	@ApiProperty({
		description: 'Issuing-authority verification has not been performed',
		example: 'NOT_CHECKED',
	})
	issuerVerification: string;
	@ApiPropertyOptional({
		description: 'Review decision reason',
		type: String,
		example: 'Document matches.',
		nullable: true,
	})
	reason: string | null;
}
export class CredentialStateDto {
	@ApiProperty({ description: 'Concurrency version', example: 1 })
	version: number;
	@ApiProperty({
		description:
			'Credential-only eligibility; does not mean profile/preferences/group validity',
		example: false,
	})
	credentialEligible: boolean;
	@ApiProperty({
		description: 'Credential-only rejection codes',
		example: ['SIP_APPROVAL_REQUIRED'],
		type: [String],
	})
	reasons: string[];
	@ApiProperty({
		description: 'Suspension is separate from document approval',
		example: false,
	})
	suspended: boolean;
	@ApiProperty({
		description: 'Owned immutable document revisions',
		type: [CredentialRevisionDto],
	})
	revisions: CredentialRevisionDto[];
}
export class CredentialDetailDto extends CredentialRevisionDto {
	@ApiProperty({
		description: 'Expert identifier for this private review',
		example: '123e4567-e89b-42d3-a456-426614174000',
	})
	expertId: string;
	@ApiProperty({ description: 'Current aggregate version', example: 1 })
	version: number;
	@ApiProperty({
		description: 'Submitted original number; administrator review only',
		example: 'STR-12345',
	})
	number: string;
	@ApiProperty({
		description: 'Submitted document holder name',
		example: 'Example Expert',
	})
	holderName: string;
	@ApiProperty({
		description: 'Current registered name for comparison',
		example: 'Example Expert',
	})
	accountName: string;
}
export class CredentialQueueResponseDto {
	@ApiProperty({
		description: 'Pending private credential summaries',
		type: [CredentialRevisionDto],
	})
	items: CredentialRevisionDto[];
	@ApiProperty({ description: 'Pagination offset', example: 0 }) skip: number;
	@ApiProperty({ description: 'Pagination limit', example: 20 }) take: number;
}
