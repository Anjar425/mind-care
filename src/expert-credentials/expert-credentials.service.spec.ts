import { Test, TestingModule } from '@nestjs/testing';
import { ExpertCredentialsService } from './expert-credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialStorageService } from './credential-storage.service';
import { CredentialEligibilityService } from './credential-eligibility.service';
import {
	adminId,
	createCredentialMocks,
	expertId,
	ownerId,
	revisionId,
} from '../../test/credential-mocks';
import { ReviewDecision } from './dto/credential.dto';
import { Prisma } from '../prisma/generated/client';

describe('ExpertCredentialsService', () => {
	let module: TestingModule;
	let service: ExpertCredentialsService;
	let mocks: ReturnType<typeof createCredentialMocks>;
	const submit = () => ({
		number: 'STR-123',
		holderName: 'Example Expert',
		expiryDate: '2090-01-01',
		expectedVersion: 1,
	});
	const file = () => ({
		buffer: Buffer.from('%PDF-synthetic'),
		size: 14,
		mimetype: 'application/pdf',
	});
	const review = () => ({
		decision: ReviewDecision.APPROVE,
		digest: 'a'.repeat(64),
		documentMatches: true,
		reason: 'Document matches.',
		expectedVersion: 1,
	});
	beforeEach(async () => {
		mocks = createCredentialMocks();
		module = await Test.createTestingModule({
			providers: [
				ExpertCredentialsService,
				{ provide: PrismaService, useValue: mocks.prisma },
				{ provide: CredentialStorageService, useValue: mocks.storage },
				{
					provide: CredentialEligibilityService,
					useValue: mocks.eligibility,
				},
			],
		}).compile();
		service = module.get(ExpertCredentialsService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should read owned summaries without exposing storage references or encrypted numbers', async () => {
		const result = await service.state(ownerId);
		expect(result.credentialEligible).toBe(true);
		expect(result.revisions[0]).not.toHaveProperty('objectKey');
		expect(result.revisions[0]).not.toHaveProperty('numberCipher');
		expect(mocks.prisma.expert.upsert).not.toHaveBeenCalled();
	});
	it('should return an unsubmitted state without creating an expert on GET', async () => {
		mocks.eligibility.find.mockResolvedValue(null);
		const result = await service.state(ownerId);
		expect(result.version).toBe(0);
		expect(result.revisions).toEqual([]);
		expect(mocks.prisma.expert.upsert).not.toHaveBeenCalled();
	});
	it('should submit owner metadata and audit atomically without invalidating the existing approval', async () => {
		await service.submit(ownerId, 'STR', submit(), file());
		expect(mocks.prisma.credentialRevision.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				type: 'STR',
				holderName: 'Example Expert',
				numberCipher: 'encrypted-number',
				expertId,
			}) as unknown,
		});
		expect(
			mocks.prisma.credentialRevision.updateMany,
		).not.toHaveBeenCalled();
		expect(mocks.prisma.credentialAudit.create).toHaveBeenCalled();
		expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
			expect.any(Function),
			{ isolationLevel: 'Serializable' },
		);
	});
	it('should reject a holder/account mismatch before storing bytes', async () => {
		await expect(
			service.submit(
				ownerId,
				'STR',
				{ ...submit(), holderName: 'Other' },
				file(),
			),
		).rejects.toThrow('exactly match');
		expect(mocks.storage.put).not.toHaveBeenCalled();
	});
	it('should reject an expired submission before storing bytes', async () => {
		await expect(
			service.submit(
				ownerId,
				'STR',
				{ ...submit(), expiryDate: '2020-01-01' },
				file(),
			),
		).rejects.toThrow('expired');
		expect(mocks.storage.put).not.toHaveBeenCalled();
	});
	it('should reject stale owner edits and clean up only the newly staged object', async () => {
		await expect(
			service.submit(
				ownerId,
				'STR',
				{ ...submit(), expectedVersion: 0 },
				file(),
			),
		).rejects.toThrow('stale');
		expect(mocks.storage.remove).toHaveBeenCalledWith(mocks.row.objectKey);
		expect(mocks.prisma.credentialRevision.create).not.toHaveBeenCalled();
	});
	it('should reject concurrent pending submissions instead of silently replacing them', async () => {
		mocks.prisma.credentialRevision.findFirst.mockResolvedValue(mocks.row);
		await expect(
			service.submit(ownerId, 'STR', submit(), file()),
		).rejects.toThrow('pending');
		expect(mocks.prisma.credentialRevision.create).not.toHaveBeenCalled();
	});
	it('should reserve equivalent credential identities exclusively across owners', async () => {
		mocks.prisma.credentialIdentity.findUnique.mockResolvedValue({
			id: 'identity',
			expertId: 'another',
		});
		await expect(
			service.submit(ownerId, 'STR', submit(), file()),
		).rejects.toThrow('already assigned');
		expect(mocks.storage.remove).toHaveBeenCalled();
	});
	it('should sanitize persistence exceptions and compensate staged bytes', async () => {
		mocks.prisma.credentialRevision.create.mockRejectedValue(
			new Error('PRIVATE_CONNECTION'),
		);
		await expect(
			service.submit(ownerId, 'STR', submit(), file()),
		).rejects.toThrow('persistence is unavailable');
		expect(mocks.storage.remove).toHaveBeenCalled();
	});
	it('should map database identity/concurrency conflicts to 409', async () => {
		mocks.prisma.credentialRevision.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('PRIVATE', {
				code: 'P2002',
				clientVersion: '7.8.0',
			}),
		);
		await expect(
			service.submit(ownerId, 'STR', submit(), file()),
		).rejects.toThrow('Concurrent');
	});
	it('should approve only the exact revision and supersede the old approval with a retention deadline', async () => {
		const result = await service.review(adminId, revisionId, review());
		expect(result.version).toBe(2);
		expect(mocks.prisma.credentialRevision.updateMany).toHaveBeenCalledWith(
			{
				where: { expertId, type: 'STR', status: 'APPROVED' },
				data: {
					status: 'SUPERSEDED',
					purgeAfter: expect.any(Date) as unknown,
				},
			},
		);
		expect(mocks.prisma.credentialReminder.create).toHaveBeenCalledWith({
			data: { revisionId },
		});
		expect(
			(mocks.prisma.expert.update.mock.calls as unknown[][])[0][0],
		).not.toHaveProperty('data.credentialSuspendedAt');
	});
	it('should reject a revision without cancelling an older approved document', async () => {
		await service.review(adminId, revisionId, {
			...review(),
			decision: ReviewDecision.REJECT,
			documentMatches: false,
			reason: 'Expiry does not match.',
		});
		expect(
			mocks.prisma.credentialRevision.updateMany,
		).not.toHaveBeenCalled();
		expect(mocks.prisma.credentialRevision.update).toHaveBeenCalledWith({
			where: { id: revisionId },
			data: expect.objectContaining({
				status: 'REJECTED',
				reason: 'Expiry does not match.',
				purgeAfter: expect.any(Date) as unknown,
			}) as unknown,
		});
		expect(mocks.prisma.credentialReminder.create).not.toHaveBeenCalled();
	});
	it.each([{ expectedVersion: 0 }, { digest: 'b'.repeat(64) }])(
		'should reject stale review evidence %p before approval',
		async (override) => {
			await expect(
				service.review(adminId, revisionId, {
					...review(),
					...override,
				}),
			).rejects.toThrow('Stale');
			expect(
				mocks.prisma.credentialRevision.update,
			).not.toHaveBeenCalled();
		},
	);
	it('should require explicit manual document matching before approval', async () => {
		await expect(
			service.review(adminId, revisionId, {
				...review(),
				documentMatches: false,
			}),
		).rejects.toThrow('matching');
	});
	it('should reject approval after an account-name change', async () => {
		mocks.row.expert.user.name = 'Changed';
		await expect(
			service.review(adminId, revisionId, review()),
		).rejects.toThrow('matching');
	});
	it('should reject approval of an expired revision', async () => {
		mocks.row.expiresAt = new Date('2020-01-01');
		await expect(
			service.review(adminId, revisionId, review()),
		).rejects.toThrow('unexpired');
	});
	it('should return private review metadata only to an administrator', async () => {
		const detail = await service.detail(adminId, revisionId);
		expect(detail.number).toBe('STR-123');
		await expect(service.detail(ownerId, revisionId)).rejects.toThrow(
			'Administrator',
		);
	});
	it('should paginate the pending queue and omit private storage keys', async () => {
		const result = await service.queue(adminId, { skip: 0, take: 20 });
		expect(result.items[0]).not.toHaveProperty('objectKey');
		expect(mocks.prisma.credentialRevision.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ skip: 0, take: 20 }) as unknown,
		);
	});
	it('should enforce document ownership in the query before any file read', async () => {
		mocks.prisma.credentialRevision.findFirst.mockResolvedValue(null);
		await expect(service.download(ownerId, revisionId)).rejects.toThrow(
			'not found',
		);
		expect(mocks.storage.read).not.toHaveBeenCalled();
		expect(mocks.prisma.credentialRevision.findFirst).toHaveBeenCalledWith({
			where: { id: revisionId, expert: { userId: ownerId } },
		});
	});
	it('should download retained bytes without returning the storage path', async () => {
		mocks.prisma.credentialRevision.findFirst.mockResolvedValue(mocks.row);
		const result = await service.download(ownerId, revisionId);
		expect(result.bytes).toEqual(file().buffer);
		expect(result).not.toHaveProperty('objectKey');
	});
	it('should reject downloads after retained bytes have been purged', async () => {
		mocks.prisma.credentialRevision.findFirst.mockResolvedValue({
			...mocks.row,
			purgedAt: new Date(),
		});
		await expect(
			service.download(adminId, revisionId, true),
		).rejects.toThrow('not found');
		expect(mocks.storage.read).not.toHaveBeenCalled();
	});
	it('should suspend rights with actor/reason audit without rewriting document metadata', async () => {
		await service.setSuspension(
			adminId,
			expertId,
			{ expectedVersion: 1, reason: 'Revoked by authority.' },
			true,
		);
		expect(mocks.prisma.credentialAudit.create).toHaveBeenCalledWith({
			data: {
				expertId,
				actorId: adminId,
				action: 'SUSPEND',
				reason: 'Revoked by authority.',
			},
		});
		expect(mocks.prisma.credentialRevision.update).not.toHaveBeenCalled();
	});
	it('should require explicit reinstatement and preserve credential eligibility checks', async () => {
		mocks.expert.credentialSuspendedAt = new Date();
		await service.setSuspension(
			adminId,
			expertId,
			{ expectedVersion: 1, reason: 'Suspension reviewed.' },
			false,
		);
		expect(mocks.prisma.expert.update).toHaveBeenCalledWith({
			where: { id: expertId },
			data: {
				credentialSuspendedAt: null,
				credentialVersion: { increment: 1 },
			},
		});
	});
	it('should reject stale suspension actions', async () => {
		await expect(
			service.setSuspension(
				adminId,
				expertId,
				{ expectedVersion: 0, reason: 'Revoked.' },
				true,
			),
		).rejects.toThrow('stale');
	});
});
