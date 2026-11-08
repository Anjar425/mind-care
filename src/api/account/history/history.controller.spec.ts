import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { HistoryController } from './history.controller';
import { HistoryService } from '../../../domain/history/history.service';
import { HistoryVaultService } from '../../../domain/history/history-vault.service';
import {
	historyEntryId,
	historyEntryInput,
	historyInit,
	historyMocks,
	historyOwner,
} from '../../../../test/history-mocks';
describe('Thin owner history controller', () => {
	it('should delegate every operation using authenticated identity and reflect creation status', async () => {
		const f = historyMocks();
		const module = await Test.createTestingModule({
			controllers: [HistoryController],
			providers: [
				{ provide: HistoryService, useValue: f.service },
				{ provide: HistoryVaultService, useValue: f.vaultService },
			],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: () => true })
			.compile();
		const controller = module.get(HistoryController);
		const req = {
			user: {
				sub: historyOwner,
				sid: 'synthetic',
				jti: 'synthetic',
				email: 'synthetic@example.invalid',
				role: 'USER',
				type: 'access' as const,
			},
		};
		await controller.initialize(req, historyInit());
		await controller.vault(req);
		await controller.consent(req, {
			expectedVaultRevision: 0,
			enabled: true,
		});
		const status = jest.fn();
		await controller.save(req, historyEntryId, historyEntryInput(), {
			status,
		} as unknown as Response);
		expect(status).toHaveBeenCalledWith(201);
		await controller.save(req, historyEntryId, historyEntryInput(), {
			status,
		} as unknown as Response);
		expect(status).toHaveBeenLastCalledWith(200);
		expect(
			(await controller.list(req, { limit: 25 })).entries,
		).toHaveLength(1);
		await controller.read(req, historyEntryId);
		await controller.remove(req, historyEntryId, {
			expectedVaultRevision: 2,
		});
		await controller.removeAll(req, { expectedVaultRevision: 3 });
		const init = historyInit();
		await controller.recovery(req, {
			expectedVaultRevision: 4,
			recoveryVersion: 2,
			recoveryNonce: init.recoveryNonce,
			recoveryCiphertext: init.recoveryCiphertext,
		});
		await module.close();
	});
});
