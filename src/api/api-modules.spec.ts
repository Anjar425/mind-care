import { PATH_METADATA } from '@nestjs/common/constants';
import type { Type } from '@nestjs/common';
import { MetadataScanner } from '@nestjs/core';
import { AccountApiModule } from './account/account-api.module';
import { AdminApiModule } from './admin/admin-api.module';
import { controllerBasePath, PRIVACY_BOUNDARIES } from './app.setup';
import { RATE_LIMIT_ACTION } from './common/rate-limit/rate-limit.decorator';
import { ExpertApiModule } from './expert/expert-api.module';
import { HealthModule } from './health/health.module';
import { PublicApiModule } from './public/public-api.module';

// Folder hierarchy == API hierarchy: every controller of an audience module serves a path
// owned by that audience. Everything except /health is served under /api/v1.
const AUDIENCES: [string, Type, RegExp][] = [
	[
		'public',
		PublicApiModule,
		/^(auth|references|groups\/public|screenings)$/,
	],
	['account', AccountApiModule, /^account\//],
	['expert', ExpertApiModule, /^expert(\/|$)/],
	['admin', AdminApiModule, /^admin\//],
	['health', HealthModule, /^health$/],
];

const controllersOf = (module: Type) =>
	(Reflect.getMetadata('controllers', module) ?? []) as Type[];
const allControllers = () =>
	AUDIENCES.flatMap(([, module]) => controllersOf(module));

/** Every handler of every controller as `path segments`, with its method function. */
function handlers() {
	const scanner = new MetadataScanner();
	return allControllers().flatMap((controller) => {
		const base = String(Reflect.getMetadata(PATH_METADATA, controller));
		const proto = controller.prototype as Record<string, object>;
		return scanner.getAllMethodNames(proto).flatMap((name) => {
			const path = Reflect.getMetadata(PATH_METADATA, proto[name]) as
				string | undefined;
			if (path === undefined) return [];
			return [{ path: `${base}/${path}`, handler: proto[name] }];
		});
	});
}

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
		const all = allControllers();
		expect(all).toHaveLength(20);
		expect(new Set(all).size).toBe(all.length);
	});

	it('has no /me route: the caller is implied by the token and the audience', () => {
		for (const { path } of handlers())
			expect(path.split('/')).not.toContain('me');
	});

	it('binds every action rate limit to a registered handler (11 handlers)', () => {
		const limited = handlers().filter(({ handler }) =>
			Reflect.getMetadata(RATE_LIMIT_ACTION, handler),
		);
		expect(limited).toHaveLength(11);
	});

	it('mounts the privacy middleware at the versioned base path of its controller', () => {
		expect(
			PRIVACY_BOUNDARIES.map(([controller]) =>
				controllerBasePath(controller),
			),
		).toEqual(['/api/v1/account/history', '/api/v1/screenings']);
	});
});
