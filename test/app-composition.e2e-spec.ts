// Compiles and initialises the real AppModule graph (every module, controller, guard and
// provider) with only the database and SMTP transport replaced. Catches dependency-injection
// wiring mistakes that feature tests, which assemble their own providers, cannot see.
import type { INestApplication, Type } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import './app-composition.env';
import { AppModule } from '../src/app.module';
import { MAIL_TRANSPORT } from '../src/infrastructure/mail/mail-transport';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('AppModule composition', () => {
	let app: INestApplication;

	beforeAll(async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(PrismaService)
			.useValue({
				$connect: jest.fn(),
				$disconnect: jest.fn(),
				$queryRaw: jest.fn(),
			})
			.overrideProvider(MAIL_TRANSPORT)
			.useValue({ sendMail: jest.fn(), close: jest.fn() })
			.compile();
		app = module.createNestApplication({ logger: false });
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
	});

	function routes(): string[] {
		const discovery = app.get(DiscoveryService);
		const scanner = app.get(MetadataScanner);
		const found: string[] = [];
		for (const wrapper of discovery.getControllers()) {
			const type = wrapper.metatype as Type | undefined;
			if (!type) continue;
			const base = String(Reflect.getMetadata(PATH_METADATA, type) ?? '');
			const proto = type.prototype as Record<string, unknown>;
			for (const name of scanner.getAllMethodNames(proto)) {
				const handler = proto[name] as object;
				const path = Reflect.getMetadata(PATH_METADATA, handler) as
					string | undefined;
				if (path === undefined) continue;
				const method =
					RequestMethod[
						Reflect.getMetadata(METHOD_METADATA, handler) as number
					];
				const full = `/${[base, path].filter(Boolean).join('/')}`
					.replace(/\/+/g, '/')
					.replace(/(.)\/$/, '$1');
				found.push(`${method} ${full}`);
			}
		}
		return found;
	}

	it('resolves every provider, controller and guard of the real module graph', () => {
		expect(app).toBeDefined();
	});

	it('registers all 96 operations exactly once', () => {
		const all = routes();
		expect(all).toHaveLength(96);
		expect(new Set(all).size).toBe(all.length);
	});

	it('schedules the credential maintenance job exactly once', () => {
		expect([...app.get(SchedulerRegistry).getCronJobs().keys()]).toEqual([
			'credential-maintenance',
		]);
	});
});
