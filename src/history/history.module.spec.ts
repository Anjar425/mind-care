import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { HistoryModule } from './history.module';
import { HistoryService } from './history.service';
import { HistoryVaultService } from './history-vault.service';
import { historyMocks } from '../../test/history-mocks';
@Module({})
class SyntheticAuthModule {}
describe('History module wiring without live services', () => {
	it('should resolve real storage and vault services with synthetic persistence', async () => {
		const f = historyMocks();
		const module = await Test.createTestingModule({
			imports: [HistoryModule],
		})
			.overrideModule(AuthModule)
			.useModule(SyntheticAuthModule)
			.overrideProvider(PrismaService)
			.useValue(f.prisma)
			.compile();
		expect(module.get(HistoryService)).toBeDefined();
		expect(module.get(HistoryVaultService)).toBeDefined();
		await module.close();
	});
});
