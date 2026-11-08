import { Test } from '@nestjs/testing';
import { ScreeningsController } from './screenings.controller';
import { ScreeningsService } from '../../../domain/screening/screenings.service';
import { OptionalScreeningAuthGuard } from './optional-screening-auth.guard';
import {
	publicDass42Input,
	publicQdssInput,
	screeningMocks,
} from '../../../../test/screening-mocks';
describe('Thin screening controller', () => {
	it('should delegate original typed body and optional request identity', async () => {
		const f = screeningMocks();
		const module = await Test.createTestingModule({
			controllers: [ScreeningsController],
			providers: [{ provide: ScreeningsService, useValue: f.service }],
		})
			.overrideGuard(OptionalScreeningAuthGuard)
			.useValue({ canActivate: () => true })
			.compile();
		try {
			const c = module.get(ScreeningsController);
			expect((await c.qdss(publicQdssInput(), {})).audience).toBe(
				'GUEST',
			);
			expect(
				(await c.dass42(publicDass42Input(), { user: f.principal }))
					.accountId,
			).toBe(f.principal.sub);
		} finally {
			await module.close();
		}
	});
});
