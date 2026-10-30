import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CredentialMaintenanceService } from './credential-maintenance.service';
import { CredentialStorageService } from './credential-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { createCredentialMocks } from '../../test/credential-mocks';
import { runtimeConfigProvider } from '../../test/runtime-config.mock';

describe('CredentialMaintenanceService', () => {
	let module: TestingModule;
	let service: CredentialMaintenanceService;
	let mocks: ReturnType<typeof createCredentialMocks>;
	const mail = { sendCredentialExpiryReminder: jest.fn() };
	let warnings: jest.SpyInstance;
	beforeEach(async () => {
		mocks = createCredentialMocks();
		warnings = jest
			.spyOn(Logger.prototype, 'warn')
			.mockImplementation(() => undefined);
		mail.sendCredentialExpiryReminder.mockResolvedValue(undefined);
		module = await Test.createTestingModule({
			providers: [
				CredentialMaintenanceService,
				runtimeConfigProvider,
				{ provide: PrismaService, useValue: mocks.prisma },
				{ provide: CredentialStorageService, useValue: mocks.storage },
				{ provide: MailService, useValue: mail },
			],
		}).compile();
		service = module.get(CredentialMaintenanceService);
	});
	afterEach(async () => {
		await module.close();
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should purge only due rejected/replaced bytes and mark idempotent completion', async () => {
		await service.purge();
		expect(mocks.prisma.credentialRevision.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: { in: ['REJECTED', 'SUPERSEDED'] },
					purgedAt: null,
				}) as unknown,
			}) as unknown,
		);
		expect(mocks.storage.remove).toHaveBeenCalledWith(mocks.row.objectKey);
		expect(mocks.prisma.credentialRevision.updateMany).toHaveBeenCalled();
	});
	it('should retain the purge marker when storage deletion fails', async () => {
		mocks.storage.remove.mockRejectedValue(new Error('PRIVATE_IO'));
		await expect(service.purge()).rejects.toThrow();
		expect(
			mocks.prisma.credentialRevision.updateMany,
		).not.toHaveBeenCalled();
	});
	it('should preserve expired approvals because expiry alone is not a retention trigger', async () => {
		mocks.prisma.credentialRevision.findMany.mockResolvedValue([]);
		await service.purge();
		expect(mocks.storage.remove).not.toHaveBeenCalled();
		expect(
			(
				mocks.prisma.credentialRevision.findMany.mock
					.calls as unknown as { where: unknown }[][]
			)[0][0].where,
		).not.toHaveProperty('expiresAt');
	});
	it('should reconcile only old generated objects with no database reference', async () => {
		mocks.storage.orphanCandidates.mockResolvedValue(['generated.bin']);
		mocks.prisma.credentialRevision.findUnique.mockResolvedValue(null);
		await service.reconcile();
		expect(mocks.storage.remove).toHaveBeenCalledWith('generated.bin');
	});
	it('should stop orphan deletion when database reference lookup fails', async () => {
		mocks.storage.orphanCandidates.mockResolvedValue(['generated.bin']);
		mocks.prisma.credentialRevision.findUnique.mockRejectedValue(
			new Error('DB'),
		);
		await expect(service.reconcile()).rejects.toThrow();
		expect(mocks.storage.remove).not.toHaveBeenCalled();
	});
	const due = () => ({
		id: 'reminder',
		revisionId: mocks.row.id,
		revision: mocks.row,
	});
	it('should claim and send a durable owner-only reminder for a current approval', async () => {
		mocks.row.status = 'APPROVED';
		mocks.prisma.credentialReminder.findMany.mockResolvedValue([due()]);
		await service.remind();
		expect(mail.sendCredentialExpiryReminder).toHaveBeenCalledWith(
			'synthetic@example.test',
			'STR',
			'2090-01-01',
		);
		expect(
			mocks.prisma.credentialReminder.updateMany,
		).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: {
					deliveredAt: expect.any(Date) as unknown,
					leaseUntil: null,
					lastFailure: null,
				},
			}) as unknown,
		);
	});
	it('should skip reminders already claimed by another worker', async () => {
		mocks.prisma.credentialReminder.findMany.mockResolvedValue([due()]);
		mocks.prisma.credentialReminder.updateMany.mockResolvedValue({
			count: 0,
		});
		await service.remind();
		expect(mail.sendCredentialExpiryReminder).not.toHaveBeenCalled();
	});
	it('should cancel obsolete reminders when the revision is no longer approved', async () => {
		mocks.row.status = 'SUPERSEDED';
		mocks.prisma.credentialReminder.findMany.mockResolvedValue([due()]);
		await service.remind();
		expect(mail.sendCredentialExpiryReminder).not.toHaveBeenCalled();
		expect(
			mocks.prisma.credentialReminder.updateMany,
		).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: {
					lastFailure: 'NO_LONGER_ELIGIBLE',
					leaseUntil: null,
					attempts: 5,
				},
			}) as unknown,
		);
	});
	it('should retry transport failures without logging recipient, number or provider error', async () => {
		mocks.row.status = 'APPROVED';
		mocks.prisma.credentialReminder.findMany.mockResolvedValue([due()]);
		mail.sendCredentialExpiryReminder.mockRejectedValue(
			new Error('PRIVATE_PROVIDER'),
		);
		await service.remind();
		expect(
			mocks.prisma.credentialReminder.updateMany,
		).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					lastFailure: 'DELIVERY_FAILED',
				}) as unknown,
			}) as unknown,
		);
		expect(JSON.stringify(warnings.mock.calls)).not.toMatch(
			/PRIVATE_PROVIDER|synthetic@example/,
		);
	});
	it('should recover the scheduler after an isolated maintenance failure', async () => {
		mocks.prisma.credentialRevision.findMany.mockRejectedValueOnce(
			new Error('DB'),
		);
		await service.tick();
		await service.tick();
		expect(mocks.prisma.credentialRevision.findMany).toHaveBeenCalledTimes(
			2,
		);
	});
});
