import { Test, TestingModule } from '@nestjs/testing';
import { ExpertProfileController } from './expert-profile.controller';
import { ExpertProfileService } from './expert-profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import type { AccessPrincipal } from '../auth/session.types';
import { validProfileSubmission } from '../../test/expert-profile-mocks';
describe('ExpertProfileController', () => {
	let module: TestingModule;
	let controller: ExpertProfileController;
	const service = { read: jest.fn(), submit: jest.fn() };
	const req = { user: { sub: 'owner' } as AccessPrincipal };
	beforeEach(async () => {
		module = await Test.createTestingModule({
			controllers: [ExpertProfileController],
			providers: [{ provide: ExpertProfileService, useValue: service }],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(VerifiedEmailGuard)
			.useValue({ canActivate: () => true })
			.compile();
		controller = module.get(ExpertProfileController);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(controller).toBeDefined());
	it('should read only the authenticated owner profile', async () => {
		await controller.read(req);
		expect(service.read).toHaveBeenCalledWith('owner');
	});
	it('should forward the complete payload and authenticated owner without converting values', async () => {
		const dto = validProfileSubmission();
		await controller.submit(req, dto);
		expect(service.submit).toHaveBeenCalledWith('owner', dto);
	});
	it('should propagate safe service failures rather than claim persistence succeeded', async () => {
		service.submit.mockRejectedValueOnce(new Error('Unavailable'));
		await expect(
			controller.submit(req, validProfileSubmission()),
		).rejects.toThrow('Unavailable');
	});
});
