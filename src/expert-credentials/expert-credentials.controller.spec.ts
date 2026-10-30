import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { ExpertCredentialsController } from './expert-credentials.controller';
import { ExpertCredentialsService } from './expert-credentials.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import type { AccessPrincipal } from '../auth/session.types';
describe('ExpertCredentialsController', () => {
	let module: TestingModule;
	let controller: ExpertCredentialsController;
	const service = {
		state: jest.fn(),
		submit: jest.fn(),
		download: jest.fn(),
	};
	const req = { user: { sub: 'owner' } as AccessPrincipal };
	beforeEach(async () => {
		module = await Test.createTestingModule({
			controllers: [ExpertCredentialsController],
			providers: [
				{ provide: ExpertCredentialsService, useValue: service },
			],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(VerifiedEmailGuard)
			.useValue({ canActivate: () => true })
			.compile();
		controller = module.get(ExpertCredentialsController);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(controller).toBeDefined());
	it('should scope state reads to the authenticated owner', () => {
		void controller.state(req);
		expect(service.state).toHaveBeenCalledWith('owner');
	});
	it('should forward immutable upload metadata without accepting an expert identity', () => {
		const dto = {
			number: 'STR-1',
			holderName: 'Example',
			expiryDate: '2090-01-01',
			expectedVersion: 0,
		};
		const file = {
			buffer: Buffer.from('%PDF-'),
			size: 5,
			mimetype: 'application/pdf',
		};
		void controller.submit(req, 'STR', dto, file);
		expect(service.submit).toHaveBeenCalledWith('owner', 'STR', dto, file);
	});
	it('should produce private attachment headers and preserve download failures', async () => {
		service.download.mockResolvedValue({
			bytes: Buffer.from('%PDF-'),
			mime: 'application/pdf',
			filename: 'STR-example.pdf',
		});
		const setHeader = jest.fn();
		const result = await controller.download(req, 'id', {
			setHeader,
		} as unknown as Response);
		expect(result.getHeaders().disposition).toContain('attachment');
		expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
		service.download.mockRejectedValue(new Error('unavailable'));
		await expect(
			controller.download(req, 'id', {
				setHeader,
			} as unknown as Response),
		).rejects.toThrow('unavailable');
	});
});
