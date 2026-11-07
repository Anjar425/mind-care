import type {
	EntryMutation,
	HistoryPageQuery,
	RecoveryReplacement,
	VaultInitialization,
} from '../history.types';
import {
	createHistoryVault,
	decryptHistoryDocument,
	encryptHistoryDocument,
	recoverHistoryDevice,
	replaceHistoryRecovery,
} from './history-crypto';
import type { HistoryDeviceStore } from './history-device-store';
import { historySeries } from './history-document';
import { validateHistoryDocument } from './history-document';
import type { HistoryDocument } from './history-document';

export interface ClientVault {
	id: string;
	userId: string;
	keyEpoch: 1;
	envelopeVersion: 1;
	revision: number;
	storageConsent: boolean;
	recoveryVersion: number;
	recoveryNonce: string;
	recoveryCiphertext: string;
}
export interface ClientEntry {
	id: string;
	vaultId: string;
	keyEpoch: number;
	envelopeVersion: number;
	nonce: string;
	ciphertext: string;
}
export interface HistoryTransport {
	vault(): Promise<ClientVault>;
	initialize(input: VaultInitialization): Promise<ClientVault>;
	consent(revision: number, enabled: boolean): Promise<ClientVault>;
	recovery(input: RecoveryReplacement): Promise<ClientVault>;
	save(
		id: string,
		input: EntryMutation,
	): Promise<{ vaultRevision: number; created: boolean }>;
	page(query: HistoryPageQuery): Promise<{
		entries: ClientEntry[];
		vaultRevision: number;
		nextCursor: string | null;
	}>;
	remove(
		id: string | null,
		revision: number,
	): Promise<{ vaultRevision: number }>;
}
export interface HistoryApiRequest {
	<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		body?: unknown,
	): Promise<{ data: T }>;
}
// Frontend supplies its authenticated HTTP client; SDK never stores bearer tokens.
export function historyTransport(request: HistoryApiRequest): HistoryTransport {
	const send = async <T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		path: string,
		body?: unknown,
	) => (await request<T>(method, `/me/history${path}`, body)).data;
	return {
		vault: () => send<ClientVault>('GET', '/vault'),
		initialize: (input) => send<ClientVault>('POST', '/vault', input),
		consent: (expectedVaultRevision, enabled) =>
			send<ClientVault>('PUT', '/consent', {
				expectedVaultRevision,
				enabled,
			}),
		recovery: (input) => send<ClientVault>('PUT', '/vault', input),
		save: (id, input) =>
			send('PUT', `/entries/${encodeURIComponent(id)}`, input),
		page: (query) => {
			const search = new URLSearchParams({ limit: String(query.limit) });
			if (query.cursor) search.set('cursor', query.cursor);
			if (query.expectedVaultRevision !== undefined)
				search.set(
					'expectedVaultRevision',
					String(query.expectedVaultRevision),
				);
			return send('GET', `/entries?${search.toString()}`);
		},
		remove: (id, expectedVaultRevision) =>
			send(
				'DELETE',
				id === null ? '/entries' : `/entries/${encodeURIComponent(id)}`,
				{ expectedVaultRevision },
			),
	};
}
export class PrivateHistoryClient {
	accountId(): string {
		return this.ownerId;
	}
	constructor(
		private readonly ownerId: string,
		private readonly api: HistoryTransport,
		private readonly devices: HistoryDeviceStore,
		private readonly crypto: Crypto = globalThis.crypto,
	) {}
	private scope(vault: ClientVault) {
		if (
			vault.userId !== this.ownerId ||
			vault.keyEpoch !== 1 ||
			vault.envelopeVersion !== 1
		)
			throw new Error('Private history vault unavailable');
		return {
			ownerId: this.ownerId,
			vaultId: vault.id,
			keyEpoch: 1 as const,
		};
	}
	async initialize() {
		const prepared = await createHistoryVault(this.ownerId, this.crypto);
		// Save the local wrapped key first: a lost POST response must not lose the only usable key.
		await this.devices.put(prepared.material);
		const vault = await this.api.initialize(prepared.initialization);
		this.scope(vault);
		return { vault, recoveryCode: prepared.recoveryCode };
	}
	async enableAutomaticSaving(recoveryCodeBackedUp: true) {
		if (recoveryCodeBackedUp !== true)
			throw new Error(
				'Back up the recovery code before enabling history storage',
			);
		const vault = await this.api.vault();
		this.scope(vault);
		if (!(await this.devices.get(this.ownerId, vault.id)))
			throw new Error('Private history is locked on this device');
		return this.api.consent(vault.revision, true);
	}
	async withdrawConsent() {
		const vault = await this.api.vault();
		this.scope(vault);
		return this.api.consent(vault.revision, false);
	}
	async recoverDevice(code: string) {
		const vault = await this.api.vault();
		const b = this.scope(vault);
		const material = await recoverHistoryDevice(
			b,
			vault,
			code,
			this.crypto,
		);
		await this.devices.put(material);
	}
	async replaceRecoveryCode() {
		const vault = await this.api.vault();
		const b = this.scope(vault);
		const material = await this.devices.get(this.ownerId, vault.id);
		if (!material)
			throw new Error('Private history is locked on this device');
		const replacement = await replaceHistoryRecovery(
			b,
			material,
			vault.recoveryVersion + 1,
			this.crypto,
		);
		await this.api.recovery({
			...replacement.envelope,
			expectedVaultRevision: vault.revision,
		});
		return { recoveryCode: replacement.recoveryCode };
	}
	// Call ONLY after a successful screening. No guest API, plaintext queue or automatic conflict retry.
	async saveSuccessfulScreening(document: HistoryDocument) {
		let id: string | undefined;
		try {
			validateHistoryDocument(document);
			const accepted = structuredClone(document);
			const vault = await this.api.vault();
			const b = this.scope(vault);
			if (!vault.storageConsent)
				return {
					saved: false as const,
					reason: 'CONSENT_OFF' as const,
				};
			const material = await this.devices.get(this.ownerId, vault.id);
			if (!material)
				return {
					saved: false as const,
					reason: 'DEVICE_LOCKED' as const,
				};
			id = this.crypto.randomUUID();
			const envelope = await encryptHistoryDocument(
				b,
				material,
				id,
				accepted,
				this.crypto,
			);
			const result = await this.api.save(id, {
				...envelope,
				expectedVaultRevision: vault.revision,
			});
			return {
				saved: true as const,
				id,
				vaultRevision: result.vaultRevision,
			};
		} catch {
			// A response may be lost AFTER commit; never claim definite failure or blindly duplicate/replay.
			return {
				saved: false as const,
				reason: 'UNCONFIRMED' as const,
				...(id ? { id } : {}),
			};
		}
	}
	async page(query: HistoryPageQuery = { limit: 25 }) {
		const vault = await this.api.vault();
		const b = this.scope(vault);
		const material = await this.devices.get(this.ownerId, vault.id);
		if (!material)
			throw new Error('Private history is locked on this device');
		const page = await this.api.page({
			...query,
			expectedVaultRevision:
				query.expectedVaultRevision ?? vault.revision,
		});
		const documents: HistoryDocument[] = [];
		const items: { id: string; document: HistoryDocument }[] = [];
		const unavailableIds: string[] = [];
		for (const entry of page.entries) {
			try {
				const document = await decryptHistoryDocument(
					b,
					material,
					entry.id,
					entry,
					this.crypto,
				);
				documents.push(document);
				items.push({ id: entry.id, document });
			} catch {
				unavailableIds.push(entry.id);
			}
		}
		return {
			items,
			documents,
			series: historySeries(documents),
			unavailableIds,
			complete: unavailableIds.length === 0 && page.nextCursor === null,
			nextCursor: page.nextCursor,
			vaultRevision: page.vaultRevision,
		};
	}
	async remove(id: string) {
		const vault = await this.api.vault();
		this.scope(vault);
		return this.api.remove(id, vault.revision);
	}
	async removeAllEntries() {
		const vault = await this.api.vault();
		this.scope(vault);
		// Preserve local device material, recovery envelope and explicit consent.
		return this.api.remove(null, vault.revision);
	}
}
