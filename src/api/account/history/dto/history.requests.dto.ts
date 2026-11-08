import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	Equals,
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

export class HistoryRevisionDto {
	@ApiProperty({
		minimum: 0,
		maximum: 2147483646,
		description:
			'Current vault revision; stale mutations must reload, never blindly replay.',
	})
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVaultRevision!: number;
}
export class HistoryRecoveryDto {
	@ApiProperty({
		minimum: 1,
		maximum: 2147483646,
		description:
			'Version of the user-held recovery wrapping secret; not a server decryption key.',
	})
	@IsInt()
	@Min(1)
	@Max(2147483646)
	recoveryVersion!: number;
	@ApiProperty({
		description:
			'Canonical base64url96-bit recovery IV; no secret code is submitted.',
		minLength: 16,
		maxLength: 16,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9_-]{16}$/)
	recoveryNonce!: string;
	@ApiProperty({
		description:
			'Wrapped32-byte vault key plus128-bit authentication tag; canonical base64url.',
		minLength: 64,
		maxLength: 64,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9_-]{64}$/)
	recoveryCiphertext!: string;
}
export class HistoryVaultInitializationDto extends HistoryRecoveryDto {
	@ApiProperty({
		format: 'uuid',
		description: 'Client-generated lowercase UUIDv4 vault identity.',
	})
	@IsUUID('4')
	vaultId!: string;
	@ApiProperty({
		enum: [1],
		description: 'Fixed versioned ciphertext protocol.',
	})
	@Equals(1)
	envelopeVersion!: number;
}
export class HistoryRecoveryReplacementDto extends HistoryRecoveryDto {
	@ApiProperty({ minimum: 0, maximum: 2147483646 })
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVaultRevision!: number;
}
export class HistoryConsentDto extends HistoryRevisionDto {
	@ApiProperty({
		description:
			'Explicit opt-in enables future automatic encrypted saves; false stops future writes without deleting existing history.',
	})
	@IsBoolean()
	enabled!: boolean;
}
export class HistoryEntrySubmissionDto extends HistoryRevisionDto {
	@ApiProperty({
		format: 'uuid',
		description:
			'Owned initialized vault; save never creates a replacement vault.',
	})
	@IsUUID('4')
	vaultId!: string;
	@ApiProperty({
		enum: [1],
		description:
			'Current data-key epoch; key compromise rotation is separate scope.',
	})
	@Equals(1)
	keyEpoch!: number;
	@ApiProperty({ enum: [1] })
	@Equals(1)
	envelopeVersion!: number;
	@ApiProperty({
		description: 'Fresh96-bit entry IV, canonical base64url.',
		minLength: 16,
		maxLength: 16,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9_-]{16}$/)
	nonce!: string;
	@ApiProperty({
		description:
			'Encrypted results, context and original answers, including128-bit tag. Backend cannot validate hidden clinical data.',
		maxLength: 43691,
	})
	@IsString()
	@Matches(/^[A-Za-z0-9_-]+$/)
	@MaxLength(43691)
	ciphertext!: string;
}
export class HistoryPageDto {
	@ApiPropertyOptional({
		format: 'uuid',
		description:
			'Owned entry ID cursor; sorted by opaque ID, clinical chronology is encrypted.',
	})
	@IsOptional()
	@IsUUID('4')
	cursor?: string;
	@ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 25;
	@ApiPropertyOptional({
		minimum: 0,
		maximum: 2147483646,
		description:
			'Use the previous page revision;409 means restart the snapshot.',
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@Max(2147483646)
	expectedVaultRevision?: number;
}
