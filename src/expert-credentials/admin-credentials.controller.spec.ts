import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AdminCredentialsController } from './admin-credentials.controller';
import { ExpertCredentialsService } from './expert-credentials.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessPrincipal } from '../auth/session.types';
import { ReviewDecision } from './dto/credential.dto';
describe('AdminCredentialsController', () => {
	let module: TestingModule;
	let controller: AdminCredentialsController;
	const service = {
		queue: jest.fn(),
		detail: jest.fn(),
		download: jest.fn(),
		review: jest.fn(),
		setSuspension: jest.fn(),
	};
	const req = { user: { sub: 'admin' } as AccessPrincipal };
	beforeEach(async () => {
		module = await Test.createTestingModule({
			controllers: [AdminCredentialsController],
			providers: [
				{ provide: ExpertCredentialsService, useValue: service },
			],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.compile();
		controller = module.get(AdminCredentialsController);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(controller).toBeDefined());
	it('should scope queue and detail reads to an authenticated reviewer', () => {
		void controller.queue(req, { skip: 0, take: 20 });
		void controller.detail(req, 'id');
		expect(service.queue).toHaveBeenCalledWith('admin', {
			skip: 0,
			take: 20,
		});
		expect(service.detail).toHaveBeenCalledWith('admin', 'id');
	});
	it('should forward approve/reject without an endpoint for metadata editing', () => {
		const dto = {
			decision: ReviewDecision.REJECT,
			documentMatches: false,
			digest: 'a'.repeat(64),
			expectedVersion: 0,
			reason: 'Mismatch.',
		};
		void controller.review(req, 'id', dto);
		expect(service.review).toHaveBeenCalledWith('admin', 'id', dto);
	});
	it('should keep suspension and reinstatement explicit and separately audited', () => {
		const dto = { expectedVersion: 0, reason: 'Reviewed.' };
		void controller.suspend(req, 'expert', dto);
		void controller.reinstate(req, 'expert', dto);
		expect(service.setSuspension).toHaveBeenCalledWith(
			'admin',
			'expert',
			dto,
			true,
		);
		expect(service.setSuspension).toHaveBeenCalledWith(
			'admin',
			'expert',
			dto,
			false,
		);
	});
	it('should request admin-authorized document bytes with private attachment headers', async () => {
		service.download.mockResolvedValue({
			bytes: Buffer.from('private'),
			mime: 'application/pdf',
			filename: 'safe.pdf',
		});
		const setHeader = jest.fn();
		await controller.download(req, 'revision', {
			setHeader,
		} as unknown as Response);
		expect(service.download).toHaveBeenCalledWith(
			'admin',
			'revision',
			true,
		);
		expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
	});
});
