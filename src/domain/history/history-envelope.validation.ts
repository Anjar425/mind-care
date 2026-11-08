import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
	MAX_HISTORY_BYTES,
	type ConsentMutation,
	type EntryMutation,
	type RecoveryReplacement,
	type VaultInitialization,
	type VaultMutation,
} from '../../shared/contracts/history-envelope';

export function historyBadInput(): never {
	throw new BadRequestException('Invalid history envelope or request');
}
export function historyId(value: unknown): asserts value is string {
	if (
		typeof value !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			value,
		)
	)
		historyBadInput();
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		historyBadInput();
	const record = value as Record<string, unknown>;
	if (
		Object.keys(record).length !== keys.length ||
		keys.some((k) => !Object.hasOwn(record, k))
	)
		historyBadInput();
	return record;
}
function integer(value: unknown, minimum: number): asserts value is number {
	if (
		!Number.isSafeInteger(value) ||
		(value as number) < minimum ||
		(value as number) >= 2147483647
	)
		historyBadInput();
}
function encoded(value: unknown, min: number, max: number) {
	if (typeof value !== 'string') historyBadInput();
	if (value.length > Math.ceil((max * 4) / 3))
		throw new PayloadTooLargeException('History envelope exceeds capacity');
	if (!/^[A-Za-z0-9_-]+$/.test(value)) historyBadInput();
	const bytes = Buffer.from(value, 'base64url');
	if (
		bytes.length < min ||
		bytes.length > max ||
		bytes.toString('base64url') !== value
	)
		historyBadInput();
}
const recoveryKeys = ['recoveryVersion', 'recoveryNonce', 'recoveryCiphertext'];
function recovery(r: Record<string, unknown>) {
	integer(r.recoveryVersion, 1);
	encoded(r.recoveryNonce, 12, 12);
	encoded(r.recoveryCiphertext, 48, 48);
}
export function initialization(value: unknown): VaultInitialization {
	const r = object(value, ['vaultId', 'envelopeVersion', ...recoveryKeys]);
	historyId(r.vaultId);
	if (r.envelopeVersion !== 1 || r.recoveryVersion !== 1) historyBadInput();
	recovery(r);
	return { ...r } as unknown as VaultInitialization;
}
export function recoveryReplacement(value: unknown): RecoveryReplacement {
	const r = object(value, ['expectedVaultRevision', ...recoveryKeys]);
	integer(r.expectedVaultRevision, 0);
	recovery(r);
	return { ...r } as unknown as RecoveryReplacement;
}
export function consentMutation(value: unknown): ConsentMutation {
	const r = object(value, ['expectedVaultRevision', 'enabled']);
	integer(r.expectedVaultRevision, 0);
	if (typeof r.enabled !== 'boolean') historyBadInput();
	return { ...r } as unknown as ConsentMutation;
}
export function vaultMutation(value: unknown): VaultMutation {
	const r = object(value, ['expectedVaultRevision']);
	integer(r.expectedVaultRevision, 0);
	return { expectedVaultRevision: r.expectedVaultRevision };
}
export function entryMutation(value: unknown): EntryMutation {
	const r = object(value, [
		'expectedVaultRevision',
		'vaultId',
		'keyEpoch',
		'envelopeVersion',
		'nonce',
		'ciphertext',
	]);
	integer(r.expectedVaultRevision, 0);
	historyId(r.vaultId);
	if (r.keyEpoch !== 1 || r.envelopeVersion !== 1) historyBadInput();
	encoded(r.nonce, 12, 12);
	encoded(r.ciphertext, 17, MAX_HISTORY_BYTES);
	return { ...r } as unknown as EntryMutation;
}
