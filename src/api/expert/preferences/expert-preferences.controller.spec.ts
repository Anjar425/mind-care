import { Test, TestingModule } from '@nestjs/testing';
import { ExpertPreferencesController } from './expert-preferences.controller';
import { ExpertPreferencesService } from '../../../domain/preferences/expert-preferences.service';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { VerifiedEmailGuard } from '../../common/auth/verified-email.guard';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { validPreferencesSubmission } from '../../../../test/expert-preferences-mocks';

describe('ExpertPreferencesController', () => {
	let module: TestingModule;
	let controller: ExpertPreferencesController;
	const service = { read: jest.fn(), replace: jest.fn() };
	const req = { user: { sub: 'owner' } as AccessPrincipal };
	beforeEach(async () => {
		module = await Test.createTestingModule({
			controllers: [ExpertPreferencesController],
			providers: [
				{ provide: ExpertPreferencesService, useValue: service },
			],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(VerifiedEmailGuard)
			.useValue({ canActivate: () => true })
			.compile();
		controller = module.get(ExpertPreferencesController);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(controller).toBeDefined());
	it('should derive the owner from the authenticated principal for reads', async () => {
		await controller.read(req);
		expect(service.read).toHaveBeenCalledWith('owner');
	});
	it('should forward the full unchanged set without a caller-selected owner', async () => {
		const dto = validPreferencesSubmission();
		await controller.replace(req, dto);
		expect(service.replace).toHaveBeenCalledWith('owner', dto);
	});
	it('should propagate failures instead of returning a successful partial result', async () => {
		service.replace.mockRejectedValueOnce(new Error('Unavailable'));
		await expect(
			controller.replace(req, validPreferencesSubmission()),
		).rejects.toThrow('Unavailable');
	});
});
