import { PATH_METADATA } from '@nestjs/common/constants';
import type { Type } from '@nestjs/common';
import { AccountApiModule } from './account/account-api.module';
import { AdminApiModule } from './admin/admin-api.module';
import { ExpertApiModule } from './expert/expert-api.module';
import { HealthModule } from './health/health.module';
import { PublicApiModule } from './public/public-api.module';

// Folder hierarchy == API hierarchy: every controller of an audience module serves a path
// owned by that audience. (Phase 2B moves /me/* under /account and /expert.)
const AUDIENCES: [string, Type, RegExp][] = [
	[
		'public',
		PublicApiModule,
		/^(auth|references|groups\/public|screenings)$/,
	],
	['account', AccountApiModule, /^me\/history$/],
	['expert', ExpertApiModule, /^expert(\/|$)/],
	['admin', AdminApiModule, /^admin\//],
	['health', HealthModule, /^health$/],
];

const controllersOf = (module: Type) =>
	(Reflect.getMetadata('controllers', module) ?? []) as Type[];

describe('API audience modules', () => {
	it.each(AUDIENCES)(
		'%s controllers only serve paths owned by that audience',
		(_audience, module, owned) => {
			const controllers = controllersOf(module);
			expect(controllers.length).toBeGreaterThan(0);
			for (const controller of controllers)
				expect(
					String(Reflect.getMetadata(PATH_METADATA, controller)),
				).toMatch(owned);
		},
	);

	it('registers each controller in exactly one audience module (20 in total)', () => {
		const all = AUDIENCES.flatMap(([, module]) => controllersOf(module));
		expect(all).toHaveLength(20);
		expect(new Set(all).size).toBe(all.length);
	});
});
