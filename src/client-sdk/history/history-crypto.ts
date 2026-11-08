import type {
	EntryEnvelope,
	RecoveryEnvelope,
	VaultInitialization,
} from '../../shared/contracts/history-envelope';
import { MAX_HISTORY_BYTES } from '../../shared/contracts/history-envelope';
import {
	validateHistoryDocument,
	type HistoryDocument,
} from '../../shared/contracts/history-document';

export interface DeviceMaterial {
	ownerId: string;
	vaultId: string;
	keyEpoch: 1;
	wrappingKey: CryptoKey;
	nonce: string;
	wrappedKey: string;
}
export interface VaultBinding {
	ownerId: string;
	vaultId: string;
	keyEpoch: 1;
}
const utf8 = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
function unavailable(): never {
	throw new Error('Private history could not be opened');
}
export function base64url(bytes: Uint8Array): string {
	return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
export function unbase64url(value: string): Uint8Array<ArrayBuffer> {
	if (
		typeof value !== 'string' ||
		!value.length ||
		value.length > 43691 ||
		!/^[A-Za-z0-9_-]+$/.test(value)
	)
		unavailable();
	const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = Uint8Array.from(raw, (s) => s.charCodeAt(0));
	if (base64url(bytes) !== value) unavailable();
	return bytes;
}
function uuid(value: string) {
	if (
		typeof value !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			value,
		)
	)
		unavailable();
}
function binding(b: VaultBinding) {
	uuid(b.ownerId);
	uuid(b.vaultId);
	if (b.keyEpoch !== 1) unavailable();
}
function aad(
	b: VaultBinding,
	purpose: 'device' | 'recovery' | 'entry',
	identity: string | number,
): Uint8Array<ArrayBuffer> {
	binding(b);
	return utf8.encode(
		JSON.stringify([
			'mind-care-history',
			1,
			purpose,
			b.ownerId,
			b.vaultId,
			b.keyEpoch,
			identity,
		]),
	);
}
function rawKey(crypto: Crypto, raw: Uint8Array<ArrayBuffer>) {
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
		'encrypt',
		'decrypt',
	]);
}
async function seal(
	crypto: Crypto,
	key: CryptoKey,
	bytes: Uint8Array<ArrayBuffer>,
	context: Uint8Array<ArrayBuffer>,
) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: context, tagLength: 128 },
		key,
		bytes,
	);
	return {
		nonce: base64url(iv),
		ciphertext: base64url(new Uint8Array(encrypted)),
	};
}
async function open(
	crypto: Crypto,
	key: CryptoKey,
	nonce: string,
	ciphertext: string,
	context: Uint8Array<ArrayBuffer>,
) {
	const iv = unbase64url(nonce);
	if (iv.length !== 12) unavailable();
	return new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv, additionalData: context, tagLength: 128 },
			key,
			unbase64url(ciphertext),
		),
	);
}
async function device(
	crypto: Crypto,
	b: VaultBinding,
	raw: Uint8Array<ArrayBuffer>,
): Promise<DeviceMaterial> {
	const wrappingKey = await crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt'],
	);
	const encrypted = await seal(crypto, wrappingKey, raw, aad(b, 'device', 1));
	return {
		...b,
		wrappingKey,
		nonce: encrypted.nonce,
		wrappedKey: encrypted.ciphertext,
	};
}
async function recovery(
	crypto: Crypto,
	b: VaultBinding,
	raw: Uint8Array<ArrayBuffer>,
	version: number,
) {
	if (!Number.isSafeInteger(version) || version < 1 || version > 2147483646)
		unavailable();
	const secret = crypto.getRandomValues(new Uint8Array(32));
	try {
		const key = await rawKey(crypto, secret);
		const encrypted = await seal(
			crypto,
			key,
			raw,
			aad(b, 'recovery', version),
		);
		return {
			recoveryCode: `MCH1.${base64url(secret)}`,
			envelope: {
				recoveryVersion: version,
				recoveryNonce: encrypted.nonce,
				recoveryCiphertext: encrypted.ciphertext,
			},
		};
	} finally {
		secret.fill(0);
	}
}
async function unwrapDevice(
	crypto: Crypto,
	b: VaultBinding,
	material: DeviceMaterial,
) {
	if (
		material.ownerId !== b.ownerId ||
		material.vaultId !== b.vaultId ||
		material.keyEpoch !== b.keyEpoch
	)
		unavailable();
	const raw = await open(
		crypto,
		material.wrappingKey,
		material.nonce,
		material.wrappedKey,
		aad(b, 'device', 1),
	);
	if (raw.length !== 32) unavailable();
	return raw;
}
export async function createHistoryVault(
	ownerId: string,
	crypto: Crypto = globalThis.crypto,
) {
	const b: VaultBinding = {
		ownerId,
		vaultId: crypto.randomUUID(),
		keyEpoch: 1,
	};
	binding(b);
	const raw = crypto.getRandomValues(new Uint8Array(32));
	try {
		const material = await device(crypto, b, raw);
		const recovered = await recovery(crypto, b, raw, 1);
		const initialization: VaultInitialization = {
			vaultId: b.vaultId,
			envelopeVersion: 1,
			...recovered.envelope,
		};
		return {
			binding: b,
			material,
			initialization,
			recoveryCode: recovered.recoveryCode,
		};
	} finally {
		raw.fill(0);
	}
}
export async function recoverHistoryDevice(
	b: VaultBinding,
	envelope: RecoveryEnvelope,
	code: string,
	crypto: Crypto = globalThis.crypto,
) {
	try {
		binding(b);
		if (typeof code !== 'string' || !code.startsWith('MCH1.'))
			unavailable();
		const secret = unbase64url(code.slice(5));
		if (
			secret.length !== 32 ||
			!Number.isSafeInteger(envelope.recoveryVersion) ||
			envelope.recoveryVersion < 1
		)
			unavailable();
		let raw: Uint8Array<ArrayBuffer> | undefined;
		try {
			const key = await rawKey(crypto, secret);
			raw = await open(
				crypto,
				key,
				envelope.recoveryNonce,
				envelope.recoveryCiphertext,
				aad(b, 'recovery', envelope.recoveryVersion),
			);
			if (raw.length !== 32) unavailable();
			return await device(crypto, b, raw);
		} finally {
			secret.fill(0);
			raw?.fill(0);
		}
	} catch {
		unavailable();
	}
}
export async function replaceHistoryRecovery(
	b: VaultBinding,
	material: DeviceMaterial,
	version: number,
	crypto: Crypto = globalThis.crypto,
) {
	let raw: Uint8Array<ArrayBuffer> | undefined;
	try {
		raw = await unwrapDevice(crypto, b, material);
		return await recovery(crypto, b, raw, version);
	} catch {
		unavailable();
	} finally {
		raw?.fill(0);
	}
}
export async function encryptHistoryDocument(
	b: VaultBinding,
	material: DeviceMaterial,
	id: string,
	value: unknown,
	crypto: Crypto = globalThis.crypto,
): Promise<EntryEnvelope> {
	uuid(id);
	validateHistoryDocument(value);
	// Capture before await; neither a caller mutation nor a network retry changes this ciphertext.
	const bytes = utf8.encode(JSON.stringify(value));
	if (bytes.length + 16 > MAX_HISTORY_BYTES)
		throw new Error('Private history document exceeds capacity');
	let raw: Uint8Array<ArrayBuffer> | undefined;
	try {
		raw = await unwrapDevice(crypto, b, material);
		const key = await rawKey(crypto, raw);
		const encrypted = await seal(crypto, key, bytes, aad(b, 'entry', id));
		return {
			vaultId: b.vaultId,
			keyEpoch: 1,
			envelopeVersion: 1,
			...encrypted,
		};
	} catch {
		throw new Error('Private history could not be encrypted');
	} finally {
		raw?.fill(0);
		bytes.fill(0);
	}
}
export async function decryptHistoryDocument(
	b: VaultBinding,
	material: DeviceMaterial,
	id: string,
	envelope: EntryEnvelope,
	crypto: Crypto = globalThis.crypto,
): Promise<HistoryDocument> {
	let raw: Uint8Array<ArrayBuffer> | undefined;
	let plaintext: Uint8Array<ArrayBuffer> | undefined;
	try {
		uuid(id);
		if (
			envelope.envelopeVersion !== 1 ||
			envelope.keyEpoch !== b.keyEpoch ||
			envelope.vaultId !== b.vaultId ||
			unbase64url(envelope.ciphertext).length > MAX_HISTORY_BYTES
		)
			unavailable();
		raw = await unwrapDevice(crypto, b, material);
		plaintext = await open(
			crypto,
			await rawKey(crypto, raw),
			envelope.nonce,
			envelope.ciphertext,
			aad(b, 'entry', id),
		);
		const document: unknown = JSON.parse(decoder.decode(plaintext));
		validateHistoryDocument(document);
		return document;
	} catch {
		return unavailable();
	} finally {
		raw?.fill(0);
		plaintext?.fill(0);
	}
}
