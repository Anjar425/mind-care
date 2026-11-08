import {
	consentMutation,
	entryMutation,
	historyId,
	initialization,
	recoveryReplacement,
	vaultMutation,
} from './history-envelope.validation';
import { historyEntryInput, historyInit } from '../../../test/history-mocks';

describe('Strict ciphertext boundary', () => {
	it('should accept only the versioned canonical envelope', () => {
		expect(initialization(historyInit())).toEqual(historyInit());
		expect(entryMutation(historyEntryInput())).toEqual(historyEntryInput());
		expect(
			consentMutation({ expectedVaultRevision: 0, enabled: true })
				.enabled,
		).toBe(true);
		expect(vaultMutation({ expectedVaultRevision: 0 })).toEqual({
			expectedVaultRevision: 0,
		});
	});
	it.each([
		null,
		[],
		{},
		{ ...historyInit(), recoveryCode: 'never-send-this' },
		{ ...historyInit(), envelopeVersion: 2 },
		{ ...historyInit(), recoveryVersion: 2 },
	])(
		'should reject malformed or secret-bearing initialization %j',
		(value) => {
			expect(() => initialization(value)).toThrow('Invalid history');
		},
	);
	it.each(['USER-ID', '10000000-0000-1000-8000-000000000001', '', 4, null])(
		'should reject a non-v4 identity %j',
		(value) => {
			expect(() => historyId(value)).toThrow();
		},
	);
	it.each([
		{ keyEpoch: 2 },
		{ nonce: 'A'.repeat(15) },
		{ nonce: 'A'.repeat(16) + '=' },
		{ ciphertext: 'A'.repeat(22) },
		{ ciphertext: 'AR' },
		{ expectedVaultRevision: '1' },
		{ expectedVaultRevision: -1 },
		{ expectedVaultRevision: 2147483647 },
		{ answers: [] },
	])('should reject invalid entry fields %j', (change) => {
		expect(() =>
			entryMutation({ ...historyEntryInput(), ...change }),
		).toThrow();
	});
	it('should enforce decoded byte capacity and canonical trailing bits', () => {
		expect(() =>
			entryMutation({
				...historyEntryInput(),
				ciphertext: Buffer.alloc(32768).toString('base64url'),
			}),
		).not.toThrow();
		expect(() =>
			entryMutation({
				...historyEntryInput(),
				ciphertext: Buffer.alloc(32769).toString('base64url'),
			}),
		).toThrow('capacity');
		const value = Buffer.alloc(17).toString('base64url');
		expect(() =>
			entryMutation({
				...historyEntryInput(),
				ciphertext: value.slice(0, -1) + 'B',
			}),
		).toThrow();
	});
	it.each(['true', 1, null])(
		'should reject coerced consent %j',
		(enabled) => {
			expect(() =>
				consentMutation({ expectedVaultRevision: 0, enabled }),
			).toThrow();
		},
	);
	it('should validate a replacement without receiving raw keys', () => {
		const init = historyInit();
		const envelope = {
			recoveryNonce: init.recoveryNonce,
			recoveryCiphertext: init.recoveryCiphertext,
		};
		expect(
			recoveryReplacement({
				...envelope,
				recoveryVersion: 2,
				expectedVaultRevision: 1,
			}).recoveryVersion,
		).toBe(2);
	});
});
