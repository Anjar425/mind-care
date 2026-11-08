import { webcrypto } from 'node:crypto';
import {
	historyDocument,
	historyOther,
	historyOwner,
} from '../../../test/history-mocks';
import {
	base64url,
	createHistoryVault,
	decryptHistoryDocument,
	encryptHistoryDocument,
	recoverHistoryDevice,
	replaceHistoryRecovery,
	unbase64url,
} from './history-crypto';
const crypto = webcrypto as unknown as Crypto;
const id = '30000000-0000-4000-8000-000000000001';

describe('Browser-compatible native Web Crypto history', () => {
	it.each([false, true])(
		'should round trip all original answers and results for DASS42=%s',
		async (dass42) => {
			const setup = await createHistoryVault(historyOwner, crypto);
			const document = historyDocument(dass42);
			const envelope = await encryptHistoryDocument(
				setup.binding,
				setup.material,
				id,
				document,
				crypto,
			);
			expect(
				await decryptHistoryDocument(
					setup.binding,
					setup.material,
					id,
					envelope,
					crypto,
				),
			).toEqual(document);
			expect(JSON.stringify(envelope)).not.toContain('questionId');
			expect(setup.material.wrappingKey.extractable).toBe(false);
			expect(unbase64url(envelope.nonce)).toHaveLength(12);
			expect(
				unbase64url(setup.initialization.recoveryCiphertext),
			).toHaveLength(48);
		},
	);
	it('should recover on a new device without server keys or account password', async () => {
		const setup = await createHistoryVault(historyOwner, crypto);
		const encrypted = await encryptHistoryDocument(
			setup.binding,
			setup.material,
			id,
			historyDocument(true),
			crypto,
		);
		const device = await recoverHistoryDevice(
			setup.binding,
			setup.initialization,
			setup.recoveryCode,
			crypto,
		);
		expect(device.wrappingKey).not.toBe(setup.material.wrappingKey);
		expect(
			await decryptHistoryDocument(
				setup.binding,
				device,
				id,
				encrypted,
				crypto,
			),
		).toEqual(historyDocument(true));
		await expect(
			recoverHistoryDevice(
				setup.binding,
				setup.initialization,
				'MCH1.' + base64url(new Uint8Array(32)),
				crypto,
			),
		).rejects.toThrow('could not be opened');
	});
	it('should replace a recovery secret without rewriting old ciphertext', async () => {
		const setup = await createHistoryVault(historyOwner, crypto);
		const encrypted = await encryptHistoryDocument(
			setup.binding,
			setup.material,
			id,
			historyDocument(),
			crypto,
		);
		const replacement = await replaceHistoryRecovery(
			setup.binding,
			setup.material,
			2,
			crypto,
		);
		const material = await recoverHistoryDevice(
			setup.binding,
			replacement.envelope,
			replacement.recoveryCode,
			crypto,
		);
		expect(
			await decryptHistoryDocument(
				setup.binding,
				material,
				id,
				encrypted,
				crypto,
			),
		).toEqual(historyDocument());
		await expect(
			recoverHistoryDevice(
				setup.binding,
				replacement.envelope,
				setup.recoveryCode,
				crypto,
			),
		).rejects.toThrow();
	});
	it.each([
		'owner',
		'entry',
		'nonce',
		'ciphertext',
		'version',
		'vault',
		'epoch',
	])(
		'should reject tampering with %s without leaking plaintext',
		async (kind) => {
			const setup = await createHistoryVault(historyOwner, crypto);
			const encrypted = await encryptHistoryDocument(
				setup.binding,
				setup.material,
				id,
				historyDocument(),
				crypto,
			);
			const b = { ...setup.binding };
			const changed = { ...encrypted };
			let entryId = id;
			if (kind === 'owner') b.ownerId = historyOther;
			if (kind === 'entry') entryId = id.slice(0, -1) + '2';
			if (kind === 'nonce') changed.nonce = base64url(new Uint8Array(12));
			if (kind === 'ciphertext')
				changed.ciphertext = base64url(new Uint8Array(32));
			if (kind === 'version') changed.envelopeVersion = 2;
			if (kind === 'vault') changed.vaultId = historyOther;
			if (kind === 'epoch') changed.keyEpoch = 2;
			await expect(
				decryptHistoryDocument(
					b,
					setup.material,
					entryId,
					changed,
					crypto,
				),
			).rejects.toThrow('Private history could not be opened');
		},
	);
	it('should use a fresh IV and snapshot accepted content before asynchronous encryption', async () => {
		const setup = await createHistoryVault(historyOwner, crypto);
		const value = historyDocument(true);
		const work = encryptHistoryDocument(
			setup.binding,
			setup.material,
			id,
			value,
			crypto,
		);
		value.answers[0].score = 3;
		const first = await work;
		expect(
			(
				await decryptHistoryDocument(
					setup.binding,
					setup.material,
					id,
					first,
					crypto,
				)
			).answers[0].score,
		).toBe(1.5);
		const second = await encryptHistoryDocument(
			setup.binding,
			setup.material,
			id,
			historyDocument(true),
			crypto,
		);
		expect(second.nonce).not.toBe(first.nonce);
	});
	it.each(['MCH1.invalid', '', 'MCH1.AA', 'wrong-prefix'])(
		'should reject malformed recovery codes without echoing %s',
		async (code) => {
			const setup = await createHistoryVault(historyOwner, crypto);
			await expect(
				recoverHistoryDevice(
					setup.binding,
					setup.initialization,
					code,
					crypto,
				),
			).rejects.toThrow('Private history could not be opened');
		},
	);
});
