import { Test, TestingModule } from '@nestjs/testing';
import { ExpertProfileService } from './expert-profile.service';
import { ExpertProfileCompletenessService } from './expert-profile-completeness.service';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import {
	createExpertProfileMocks,
	validProfileSubmission,
} from '../../test/expert-profile-mocks';
import { ownerId } from '../../test/credential-mocks';
describe('ExpertProfileService', () => {
	let module: TestingModule;
	let service: ExpertProfileService;
	let mocks: ReturnType<typeof createExpertProfileMocks>;
	beforeEach(async () => {
		mocks = createExpertProfileMocks();
		module = await Test.createTestingModule({
			providers: [
				ExpertProfileService,
				ExpertProfileCompletenessService,
				CredentialEligibilityService,
				{ provide: PrismaService, useValue: mocks.prisma },
			],
		}).compile();
		service = module.get(ExpertProfileService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should read owned unsubmitted capabilities without inventing clinical hours', async () => {
		const result = await service.read(ownerId);
		expect(result.profile?.clinicalHours).toBeNull();
		expect(result.profileComplete).toBe(false);
		expect(result.profile).toEqual({
			education: null,
			publicationsNumber: null,
			patientsNumber: null,
			clinicalHours: null,
		});
		expect(mocks.prisma.expert.updateMany).not.toHaveBeenCalled();
	});
	it('should return an explicit empty state without bootstrapping a row on GET', async () => {
		mocks.prisma.expert.findUnique.mockResolvedValue(null);
		expect((await service.read(ownerId)).profile).toBeNull();
	});
	it('should deny current non-expert roles on private reads', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
		await expect(service.read(ownerId)).rejects.toThrow('Expert');
	});
	it('should save exact raw metrics and all four weights in a serializable transaction', async () => {
		const dto = validProfileSubmission();
		const before = structuredClone(dto);
		const result = await service.submit(ownerId, dto);
		expect(result.version).toBe(1);
		expect(result.profileComplete).toBe(true);
		expect(result.weightsComplete).toBe(true);
		expect(result.profile).toEqual(dto.profile);
		expect(result.weights).toEqual(dto.weights);
		expect(dto).toEqual(before);
		expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
			expect.any(Function),
			{ isolationLevel: 'Serializable' },
		);
	});
	it('should reject non-100 totals before opening a transaction', async () => {
		const dto = validProfileSubmission();
		dto.weights.clinicalHoursWeight = 24;
		await expect(service.submit(ownerId, dto)).rejects.toThrow();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
	it('should reject stale complete submissions instead of overwriting newer expert input', async () => {
		const dto = validProfileSubmission();
		await service.submit(ownerId, dto);
		await expect(service.submit(ownerId, dto)).rejects.toThrow('stale');
		expect(mocks.expert.profileVersion).toBe(1);
	});
	it('should reject a failed optimistic update before writing weights', async () => {
		mocks.prisma.expert.updateMany.mockResolvedValue({ count: 0 });
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('concurrently');
		expect(mocks.prisma.weight.upsert).not.toHaveBeenCalled();
	});
	it('should roll back the simulated aggregate when weight persistence fails', async () => {
		mocks.prisma.weight.upsert.mockRejectedValue(new Error('PRIVATE_SQL'));
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('persistence is unavailable');
		expect(mocks.expert.profileVersion).toBe(0);
		expect(mocks.expert.profileValidatedAt).toBeNull();
		expect(mocks.expert.clinicalHours).toBeNull();
		expect(mocks.expert.weight).toBeNull();
	});
	it('should reject inconsistent stored values instead of returning a successful partial write', async () => {
		mocks.prisma.weight.upsert.mockImplementation(() =>
			Promise.resolve(validProfileSubmission().weights),
		);
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('could not be verified');
		expect(mocks.expert.profileVersion).toBe(0);
	});
	it.each(['STR', 'SIP'] as const)(
		'should deny writes when %s has expired while retaining owner reads',
		async (type) => {
			mocks.expert.credentialRevisions.find(
				(row) => row.type === type,
			)!.expiresAt = new Date('2020-01-01');
			await expect(
				service.submit(ownerId, validProfileSubmission()),
			).rejects.toThrow('STR and SIP');
			await expect(service.read(ownerId)).resolves.toBeDefined();
			expect(mocks.prisma.expert.updateMany).not.toHaveBeenCalled();
		},
	);
	it('should deny writes after suspension without requiring preferences or group membership', async () => {
		mocks.expert.credentialSuspendedAt = new Date();
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('STR and SIP');
		expect(mocks.prisma.weight.upsert).not.toHaveBeenCalled();
	});
	it('should recheck current verified email inside the transaction', async () => {
		mocks.expert.user.email_verified_at = null as unknown as Date;
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('STR and SIP');
		expect(mocks.prisma.expert.updateMany).not.toHaveBeenCalled();
	});
	it('should recheck holder/account identity before persisting capabilities', async () => {
		mocks.expert.user.name = 'Changed';
		await expect(
			service.submit(ownerId, validProfileSubmission()),
		).rejects.toThrow('STR and SIP');
	});
	it('should allow renewal-independent reads without leaking credential details', async () => {
		const result = await service.read(ownerId);
		expect(result).not.toHaveProperty('credentialRevisions');
		expect(result).not.toHaveProperty('user');
	});
});
