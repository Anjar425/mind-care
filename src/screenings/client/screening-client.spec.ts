import { webcrypto } from 'node:crypto';
import {
	PrivateHistoryClient,
	type HistoryTransport,
	type ClientVault,
} from '../../history/client/history-client';
import type { DeviceMaterial } from '../../history/client/history-crypto';
import type { HistoryDeviceStore } from '../../history/client/history-device-store';
import { validateHistoryDocument } from '../../history/client/history-document';
import { historyMocks, historyOwner } from '../../../test/history-mocks';
import {
	publicDass42Input,
	publicQdssInput,
	screeningMocks,
} from '../../../test/screening-mocks';
import { ScreeningClient, type ScreeningApiRequest } from './screening-client';
function fixture(account = false) {
	const s = screeningMocks();
	const request = jest.fn(
		async (method: 'POST', path: string, body: unknown) => {
			void method;
			return {
				data: path.endsWith('/qdss')
					? await s.service.evaluateQdss(
							body,
							account ? s.principal : undefined,
						)
					: await s.service.evaluateDass42(
							body,
							account ? s.principal : undefined,
						),
			};
		},
	);
	const h = historyMocks();
	const values = new Map<string, DeviceMaterial>();
	const devices: HistoryDeviceStore = {
		get: jest.fn((_u, v) => Promise.resolve(values.get(v))),
		put: jest.fn((m) => {
			values.set(m.vaultId, m);
			return Promise.resolve();
		}),
		forget: jest.fn((_u, v) => {
			values.delete(v);
			return Promise.resolve();
		}),
	};
	const transport: HistoryTransport = {
		vault: async () =>
			(await h.vaultService.read(historyOwner)) as ClientVault,
		initialize: async (input) =>
			(await h.vaultService.initialize(
				historyOwner,
				input,
			)) as ClientVault,
		consent: async (expectedVaultRevision, enabled) =>
			(await h.vaultService.consent(historyOwner, {
				expectedVaultRevision,
				enabled,
			})) as ClientVault,
		recovery: async (input) =>
			(await h.vaultService.replaceRecovery(
				historyOwner,
				input,
			)) as ClientVault,
		save: (id, input) => h.service.save(historyOwner, id, input),
		page: (query) => h.service.list(historyOwner, query),
		remove: (id, expectedVaultRevision) =>
			id === null
				? h.service.removeAll(historyOwner, { expectedVaultRevision })
				: h.service.remove(historyOwner, id, { expectedVaultRevision }),
	};
	const history = new PrivateHistoryClient(
		historyOwner,
		transport,
		devices,
		webcrypto as unknown as Crypto,
	);
	return {
		s,
		h,
		values,
		request,
		history,
		client: new ScreeningClient(request, history),
	};
}
describe('Public client orchestration and encrypted version2 history', () => {
	it('should never touch history for guest GLOBAL or GROUP screening', async () => {
		const f = fixture();
		const save = jest.spyOn(f.history, 'saveSuccessfulScreening');
		const id = jest.spyOn(f.history, 'accountId');
		for (const input of [publicQdssInput(), publicQdssInput(true)])
			expect((await f.client.qdss(input)).history).toEqual({
				saved: false,
				reason: 'GUEST_NO_SAVE',
			});
		expect(
			(await f.client.dass42(publicDass42Input())).history.reason,
		).toBe('GUEST_NO_SAVE');
		expect(save).not.toHaveBeenCalled();
		expect(id).not.toHaveBeenCalled();
		expect(f.values.size).toBe(0);
		expect(f.h.entries.size).toBe(0);
	});
	it('should encrypt version2 including original fractional answers and policy metadata after explicit consent', async () => {
		const f = fixture(true);
		await f.history.initialize();
		await f.history.enableAutomaticSaving(true);
		const input = publicDass42Input();
		const work = f.client.dass42(input);
		input.answers[0].score = 3;
		const result = await work;
		expect(result.history.saved).toBe(true);
		const page = await f.history.page();
		expect(page.documents[0].schemaVersion).toBe(2);
		expect(page.documents[0].answers[0].score).toBe(1.5);
		expect(page.documents[0].presentation).toEqual(
			result.screening.presentation,
		);
		expect(() => validateHistoryDocument(page.documents[0])).not.toThrow();
		expect(JSON.stringify([...f.h.entries.values()])).not.toContain(
			'membership_degrees',
		);
	});
	it('should preserve successful computation when history is locked, not consented or unavailable', async () => {
		const f = fixture(true);
		await f.history.initialize();
		expect((await f.client.qdss(publicQdssInput())).history.reason).toBe(
			'CONSENT_OFF',
		);
		await f.history.enableAutomaticSaving(true);
		f.values.clear();
		expect((await f.client.qdss(publicQdssInput())).history.reason).toBe(
			'DEVICE_LOCKED',
		);
		jest.spyOn(f.history, 'saveSuccessfulScreening').mockRejectedValueOnce(
			new Error('private persistence data'),
		);
		const result = await f.client.qdss(publicQdssInput());
		expect(result.screening.result).toHaveProperty('depression');
		expect(result.history).toEqual({ saved: false, reason: 'UNCONFIRMED' });
	});
	it('should not save under a changed account or require a vault for stateless success', async () => {
		const f = fixture(true);
		jest.spyOn(f.history, 'accountId').mockReturnValue('changed-account');
		const save = jest.spyOn(f.history, 'saveSuccessfulScreening');
		expect((await f.client.qdss(publicQdssInput())).history.reason).toBe(
			'ACCOUNT_CHANGED',
		);
		expect(save).not.toHaveBeenCalled();
		expect(
			(await new ScreeningClient(f.request).qdss(publicQdssInput()))
				.history.reason,
		).toBe('CLIENT_NOT_CONFIGURED');
	});
	it('should propagate invalid authentication without retrying as guest or saving', async () => {
		const f = fixture(true);
		f.request.mockRejectedValueOnce(new Error('Authentication required'));
		const save = jest.spyOn(f.history, 'saveSuccessfulScreening');
		await expect(f.client.qdss(publicQdssInput())).rejects.toThrow(
			'Authentication',
		);
		expect(f.request).toHaveBeenCalledTimes(1);
		expect(save).not.toHaveBeenCalled();
	});
	it.each([
		'instrument',
		'catalog',
		'scope',
		'guidance',
		'private-field',
		'guest-account',
	])(
		'should reject inconsistent or unsafe returned context:%s',
		async (kind) => {
			const f = fixture();
			const value = await f.s.service.evaluateQdss(publicQdssInput());
			if (kind === 'instrument')
				Object.assign(value, { instrument: 'DASS42_MAMDANI' });
			if (kind === 'catalog') value.context.catalogVersion = 'old';
			if (kind === 'scope') value.context.scope = 'GROUP';
			if (kind === 'guidance')
				value.presentation.consultationRecommended = true;
			if (kind === 'private-field')
				Object.assign(value, { privateSamples: [] });
			if (kind === 'guest-account') value.accountId = historyOwner;
			const request: ScreeningApiRequest = () =>
				Promise.resolve({ data: value });
			await expect(
				new ScreeningClient(request).qdss(publicQdssInput()),
			).rejects.toThrow();
		},
	);
});
