import { Test, TestingModule } from '@nestjs/testing';
import { ExpertPreferencesService } from './expert-preferences.service';
import { ExpertPreferencesCompletenessService } from './expert-preferences-completeness.service';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { Prisma } from '../prisma/generated/client';
import {
	createExpertPreferencesMocks,
	completePreferenceRows,
	validPreferencesSubmission,
} from '../../test/expert-preferences-mocks';
import { expertId, ownerId } from '../../test/credential-mocks';

describe('ExpertPreferencesService', () => {
	let module: TestingModule;
	let service: ExpertPreferencesService;
	let mocks: ReturnType<typeof createExpertPreferencesMocks>;
	beforeEach(async () => {
		mocks = createExpertPreferencesMocks();
		module = await Test.createTestingModule({
			providers: [
				ExpertPreferencesService,
				ExpertPreferencesCompletenessService,
				CredentialEligibilityService,
				ReferenceDataService,
				mocks.provider,
			],
		}).compile();
		service = module.get(ExpertPreferencesService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	const seed = (version?: string) => {
		mocks.state.rows = completePreferenceRows(version).map(
			(row, index) => ({ ...row, expertId, id: index + 1 }),
		);
		mocks.state.nextId = 22;
	};
	it('should be defined', () => expect(service).toBeDefined());
	it('should read empty owned state without bootstrapping an expert or preference', async () => {
		mocks.tx.expert.findUnique.mockResolvedValueOnce(null);
		const result = await service.read(ownerId);
		expect(result.preferences).toEqual([]);
		expect(result.preferencesComplete).toBe(false);
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
		expect(mocks.prisma.dASS21.findMany).not.toHaveBeenCalled();
		expect(mocks.prisma.preferences.findMany).not.toHaveBeenCalled();
	});
	it('should deny a current non-expert role before reading private preferences', async () => {
		mocks.tx.user.findUnique.mockResolvedValueOnce({
			...mocks.expert.user,
			role: 'USER',
		});
		await expect(service.read(ownerId)).rejects.toThrow('Expert role');
		expect(mocks.tx.preferences.findMany).not.toHaveBeenCalled();
	});
	it('should save all 21 exact vectors with current credentials even when no profile fields exist', async () => {
		const dto = validPreferencesSubmission();
		const before = structuredClone(dto);
		const result = await service.replace(ownerId, dto);
		expect(result.preferencesComplete).toBe(true);
		expect(result.preferences).toHaveLength(21);
		expect(result.stateHash).not.toBe(dto.expectedStateHash);
		expect(dto).toEqual(before);
		expect(mocks.expert).not.toHaveProperty('education');
		expect(mocks.tx.preferences.upsert).toHaveBeenCalledTimes(21);
		expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
			expect.any(Function),
			{ isolationLevel: 'Serializable' },
		);
		expect(mocks.tx.$queryRaw).toHaveBeenCalled();
		expect(mocks.prisma.preferences.upsert).not.toHaveBeenCalled();
		expect(mocks.prisma.dASS21.findMany).not.toHaveBeenCalled();
	});
	it('should reject invalid totals before opening a database transaction', async () => {
		const dto = validPreferencesSubmission();
		dto.preferences[0].percentStress = 24;
		await expect(service.replace(ownerId, dto)).rejects.toThrow();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should preserve existing row identities during full resubmission', async () => {
		seed();
		const before = await service.read(ownerId);
		const dto = validPreferencesSubmission(before.stateHash);
		dto.preferences[0].percentDepression++;
		dto.preferences[0].percentStress--;
		await service.replace(ownerId, dto);
		expect(mocks.state.rows).toHaveLength(21);
		expect(mocks.state.rows[0].id).toBe(1);
		expect(mocks.state.rows[0].percentDepression).toBe(41);
	});
	it('should allow two experts to own the same question without overwriting another owner', async () => {
		mocks.state.rows = completePreferenceRows().map((row, index) => ({
			...row,
			expertId: 'other-expert',
			id: index + 100,
		}));
		await service.replace(ownerId, validPreferencesSubmission());
		expect(mocks.state.rows).toHaveLength(42);
		expect(
			mocks.state.rows.filter((row) => row.dass21Id === 'DASS21-Q01'),
		).toHaveLength(2);
		expect(
			mocks.state.rows.find((row) => row.expertId === 'other-expert')?.id,
		).toBe(100);
	});
	it('should prevent stale state from silently replacing a successful earlier submission', async () => {
		const dto = validPreferencesSubmission();
		await service.replace(ownerId, dto);
		await expect(service.replace(ownerId, dto)).rejects.toThrow('stale');
		expect(mocks.state.rows).toHaveLength(21);
		expect(mocks.tx.preferences.upsert).toHaveBeenCalledTimes(21);
	});
	it('should serialize simulated simultaneous saves so only one stale-base write succeeds', async () => {
		const result = await Promise.allSettled([
			service.replace(ownerId, validPreferencesSubmission()),
			service.replace(ownerId, validPreferencesSubmission()),
		]);
		expect(result.map((row) => row.status)).toEqual([
			'fulfilled',
			'rejected',
		]);
		expect(mocks.state.rows).toHaveLength(21);
	});
	it('should reject a stale reference release without copying or writing values', async () => {
		await expect(
			service.replace(ownerId, {
				...validPreferencesSubmission(),
				catalogVersion: 'previous-release',
			}),
		).rejects.toThrow('catalog changed');
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should mark an older authored release incomplete until explicit full resubmission', async () => {
		seed('previous-release');
		const state = await service.read(ownerId);
		expect(state.preferencesComplete).toBe(false);
		expect(state.preferences[0].catalogVersion).toBe('previous-release');
		await service.replace(
			ownerId,
			validPreferencesSubmission(state.stateHash),
		);
		expect((await service.read(ownerId)).preferencesComplete).toBe(true);
	});
	it('should preserve unsubmitted or partial states rather than fill missing question vectors', async () => {
		seed();
		mocks.state.rows = mocks.state.rows.slice(0, 3);
		const state = await service.read(ownerId);
		expect(state.preferencesComplete).toBe(false);
		expect(state.preferences).toHaveLength(3);
	});
	it('should fail closed on conflicting persisted identities', async () => {
		seed();
		mocks.state.rows[1] = { ...mocks.state.rows[0], id: 2 };
		await expect(service.read(ownerId)).rejects.toThrow('requires review');
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should roll back simulated intermediate writes when an upsert fails', async () => {
		const original = mocks.tx.preferences.upsert.getMockImplementation()!;
		let writes = 0;
		mocks.tx.preferences.upsert.mockImplementation((args) =>
			++writes === 8
				? Promise.reject(new Error('PRIVATE_SQL'))
				: original(args),
		);
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('Preference persistence is unavailable');
		expect(mocks.state.rows).toEqual([]);
		expect(mocks.state.nextId).toBe(1);
	});
	it('should roll back simulated writes when final readback is inconsistent', async () => {
		mocks.tx.preferences.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('could not be verified');
		expect(mocks.state.rows).toEqual([]);
	});
	it('should fail safely when the current reference catalog is missing or changed', async () => {
		mocks.tx.dASS21.findMany.mockResolvedValueOnce([]);
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('Reference catalog unavailable');
		expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
	});
	it('should sanitize provider errors rather than return personal connection details', async () => {
		mocks.tx.preferences.findMany.mockRejectedValueOnce(
			new Error('PRIVATE_DB_PASSWORD'),
		);
		await expect(service.read(ownerId)).rejects.toThrow(
			'Preference persistence is unavailable',
		);
	});
	it.each(['P2002', 'P2034'])(
		'should map Prisma conflict %s to a safe reload request',
		async (code) => {
			mocks.prisma.$transaction.mockRejectedValueOnce(
				new Prisma.PrismaClientKnownRequestError('PRIVATE', {
					code,
					clientVersion: '7.8.0',
				}),
			);
			await expect(
				service.replace(ownerId, validPreferencesSubmission()),
			).rejects.toThrow('concurrently');
		},
	);
	it.each(['STR', 'SIP'] as const)(
		'should deny expired %s writes while retaining owned reads',
		async (type) => {
			mocks.expert.credentialRevisions.find(
				(row) => row.type === type,
			)!.expiresAt = new Date('2020-01-01');
			await expect(
				service.replace(ownerId, validPreferencesSubmission()),
			).rejects.toThrow('STR and SIP');
			await expect(service.read(ownerId)).resolves.toBeDefined();
			expect(mocks.tx.preferences.upsert).not.toHaveBeenCalled();
		},
	);
	it('should deny suspension inside the transaction without deleting existing input', async () => {
		seed();
		mocks.expert.credentialSuspendedAt = new Date();
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('STR and SIP');
		expect(mocks.state.rows).toHaveLength(21);
	});
	it('should deny changed identity or verification inside the transaction', async () => {
		mocks.expert.user.name = 'Changed';
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('STR and SIP');
		mocks.expert.user.name = 'Example Expert';
		mocks.expert.user.email_verified_at = null as unknown as Date;
		await expect(
			service.replace(ownerId, validPreferencesSubmission()),
		).rejects.toThrow('STR and SIP');
	});
	it('should provide only complete current preferences to an internal consumer', async () => {
		await expect(service.readCompleteForExpert(expertId)).rejects.toThrow(
			'complete current-catalog',
		);
		seed();
		expect(
			(await service.readCompleteForExpert(expertId)).preferences,
		).toHaveLength(21);
	});
	it('should honor the internal caller transaction instead of creating a nested transaction', async () => {
		seed();
		const result = await service.readCompleteForExpert(
			expertId,
			mocks.tx as unknown as Prisma.TransactionClient,
		);
		expect(result.preferencesComplete).toBe(true);
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should reject missing experts and revoked credentials in the internal provider', async () => {
		mocks.tx.expert.findUnique.mockResolvedValueOnce(null);
		await expect(service.readCompleteForExpert(expertId)).rejects.toThrow(
			'not found',
		);
		seed();
		mocks.expert.credentialSuspendedAt = new Date();
		await expect(service.readCompleteForExpert(expertId)).rejects.toThrow(
			'STR and SIP',
		);
	});
	it('should sanitize internal consumer failures even when its caller supplies the transaction', async () => {
		seed();
		mocks.tx.preferences.findMany.mockRejectedValueOnce(
			new Error('PRIVATE_PROVIDER_DATA'),
		);
		await expect(
			service.readCompleteForExpert(
				expertId,
				mocks.tx as unknown as Prisma.TransactionClient,
			),
		).rejects.toThrow('Preference persistence is unavailable');
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
});
