export const HISTORY_VERSION = 1;
export const HISTORY_KEY_EPOCH = 1;
export const MAX_HISTORY_BYTES = 32768;
export const MAX_HISTORY_ENTRIES = 10000;
export interface RecoveryEnvelope {
	recoveryVersion: number;
	recoveryNonce: string;
	recoveryCiphertext: string;
}
export interface VaultInitialization extends RecoveryEnvelope {
	vaultId: string;
	envelopeVersion: number;
}
export interface VaultMutation {
	expectedVaultRevision: number;
}
export interface RecoveryReplacement extends RecoveryEnvelope, VaultMutation {}
export interface ConsentMutation extends VaultMutation {
	enabled: boolean;
}
export interface EntryEnvelope {
	vaultId: string;
	keyEpoch: number;
	envelopeVersion: number;
	nonce: string;
	ciphertext: string;
}
export interface EntryMutation extends EntryEnvelope, VaultMutation {}
export interface HistoryVault extends RecoveryEnvelope {
	id: string;
	userId: string;
	envelopeVersion: number;
	keyEpoch: number;
	revision: number;
	storageConsent: boolean;
	consentUpdatedAt: Date | null;
	createdAt: Date;
}
export interface HistoryEntry extends EntryEnvelope {
	id: string;
	createdAt: Date;
}
export interface HistoryPageQuery {
	cursor?: string;
	limit: number;
	expectedVaultRevision?: number;
}
