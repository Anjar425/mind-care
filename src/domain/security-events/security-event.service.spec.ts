import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { requestContext } from '../../infrastructure/observability/request-context';
import { syntheticConfig } from '../../../test/runtime-config.mock';
import {
	SecurityEventService,
	userAgentFamily,
} from './security-event.service';

const config = {
	get: (key: keyof RuntimeEnvironment) => syntheticConfig[key],
} as unknown as ConfigService<RuntimeEnvironment, true>;

describe('SecurityEventService', () => {
	const create = jest.fn();
	const deleteMany = jest.fn();
	const prisma = {
		securityEvent: { create, deleteMany },
	} as unknown as PrismaService;
	const service = new SecurityEventService(prisma, config);
	afterEach(() => jest.restoreAllMocks());

	it('should store request facts as a keyed IP hash and a user-agent family only', async () => {
		create.mockResolvedValue({});
		await requestContext.run(
			{
				requestId: 'req-1',
				ip: '203.0.113.7',
				userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
			},
			() => service.record('LOGIN_FAILED', { subjectUserId: 'user-1' }),
		);
		const data = (
			create.mock.calls[0] as [{ data: Record<string, unknown> }]
		)[0].data;
		expect(data).toEqual({
			type: 'LOGIN_FAILED',
			actorUserId: null,
			subjectUserId: 'user-1',
			ipHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
			userAgentFamily: 'mobile',
			requestId: 'req-1',
		});
		expect(JSON.stringify(data)).not.toContain('203.0.113.7');
	});

	it('should record outside a request (jobs) without request facts', async () => {
		create.mockResolvedValue({});
		await service.record('SESSIONS_REVOKED_ALL', { subjectUserId: 'u' });
		expect(create).toHaveBeenLastCalledWith({
			data: expect.objectContaining({
				ipHash: null,
				userAgentFamily: null,
				requestId: null,
			}) as unknown,
		});
	});

	it('should never throw when the audit store fails', async () => {
		const warn = jest
			.spyOn(Logger.prototype, 'warn')
			.mockImplementation(() => undefined);
		create.mockRejectedValue(new Error('PRIVATE_DB_DETAIL'));
		await expect(
			service.record('LOGIN_SUCCEEDED'),
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith('Security event could not be stored');
		expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
	});

	it('should delete only events older than the retention period', async () => {
		deleteMany.mockResolvedValue({ count: 4 });
		const now = new Date('2026-11-08T00:00:00.000Z');
		await expect(service.purgeExpired(now)).resolves.toBe(4);
		expect(deleteMany).toHaveBeenCalledWith({
			where: { createdAt: { lt: new Date('2025-11-08T00:00:00.000Z') } },
		});
	});

	it.each([
		[undefined, null],
		['Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', 'browser'],
		['Mozilla/5.0 (Linux; Android 14) Mobile', 'mobile'],
		['curl/8.5.0', 'cli'],
		['SomethingElse/1.0', 'other'],
	])('should classify %p as %p', (agent, family) => {
		expect(userAgentFamily(agent)).toBe(family);
	});
});
