import { ApiProperty } from '@nestjs/swagger';
export class HistoryVaultDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({
		format: 'uuid',
		description:
			'Authenticated owner; no other account can request this vault.',
	})
	userId!: string;
	@ApiProperty({ enum: [1] }) envelopeVersion!: number;
	@ApiProperty({ enum: [1] }) keyEpoch!: number;
	@ApiProperty({ minimum: 0 }) revision!: number;
	@ApiProperty() storageConsent!: boolean;
	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	consentUpdatedAt!: Date | null;
	@ApiProperty({ minimum: 1 }) recoveryVersion!: number;
	@ApiProperty({
		description: 'Public IV of the encrypted user-held recovery envelope.',
	})
	recoveryNonce!: string;
	@ApiProperty({
		description:
			'Encrypted vault key; no recovery secret or raw key is returned.',
	})
	recoveryCiphertext!: string;
	@ApiProperty({ format: 'date-time' }) createdAt!: Date;
}
export class HistoryEntryDto {
	@ApiProperty({ format: 'uuid' }) id!: string;
	@ApiProperty({ format: 'uuid' }) vaultId!: string;
	@ApiProperty({ enum: [1] }) keyEpoch!: number;
	@ApiProperty({ enum: [1] }) envelopeVersion!: number;
	@ApiProperty() nonce!: string;
	@ApiProperty({
		description:
			'Opaque ciphertext including authentication tag. No clinical fields are exposed.',
	})
	ciphertext!: string;
	@ApiProperty({
		format: 'date-time',
		description: 'Storage timestamp; assessment time stays encrypted.',
	})
	createdAt!: Date;
}
export class HistoryMutationDto {
	@ApiProperty({ minimum: 0 }) vaultRevision!: number;
}
export class HistorySavedDto extends HistoryMutationDto {
	@ApiProperty({ type: () => HistoryEntryDto }) entry!: HistoryEntryDto;
	@ApiProperty({
		description: 'False for an exact still-existing immutable retry.',
	})
	created!: boolean;
}
export class HistoryPageResponseDto extends HistoryMutationDto {
	@ApiProperty({ type: () => [HistoryEntryDto] }) entries!: HistoryEntryDto[];
	@ApiProperty({ type: String, format: 'uuid', nullable: true }) nextCursor!:
		| string
		| null;
}
