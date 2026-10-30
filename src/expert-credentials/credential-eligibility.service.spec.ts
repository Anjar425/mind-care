import { Test, TestingModule } from '@nestjs/testing';
import { CredentialEligibilityService } from './credential-eligibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { createCredentialMocks, ownerId } from '../../test/credential-mocks';
describe('CredentialEligibilityService', () => {
	let module: TestingModule;
	let service: CredentialEligibilityService;
	let mocks: ReturnType<typeof createCredentialMocks>;
	beforeEach(async () => {
		mocks = createCredentialMocks();
		module = await Test.createTestingModule({
			providers: [
				CredentialEligibilityService,
				{ provide: PrismaService, useValue: mocks.prisma },
			],
		}).compile();
		service = module.get(CredentialEligibilityService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should read current approved credentials rather than the legacy verifiedUntil date', async () => {
		expect((await service.check(ownerId)).credentialEligible).toBe(true);
		expect(mocks.prisma.expert.findUnique).toHaveBeenCalledWith({
			where: { userId: ownerId },
			include: {
				user: true,
				credentialRevisions: { where: { status: 'APPROVED' } },
			},
		});
	});
	it('should require valid credentials within the caller transaction', async () => {
		expect(await service.require(ownerId)).toEqual(mocks.expert);
		mocks.prisma.expert.findUnique.mockResolvedValue(null);
		await expect(service.require(ownerId)).rejects.toThrow('STR and SIP');
	});
});
