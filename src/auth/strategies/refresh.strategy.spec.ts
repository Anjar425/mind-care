import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuthSessionService } from '../auth-session.service';
import { RefreshStrategy } from './refresh.strategy';

describe('RefreshStrategy', () => {
	let module: TestingModule;
	let strategy: RefreshStrategy;
	let sessions: jest.Mocked<Pick<AuthSessionService, 'validateRefresh'>>;
	beforeEach(async () => {
		sessions = { validateRefresh: jest.fn() };
		module = await Test.createTestingModule({
			providers: [
				RefreshStrategy,
				{ provide: AuthSessionService, useValue: sessions },
			],
		}).compile();
		strategy = module.get(RefreshStrategy);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should bind the actual bearer token when validating signed refresh claims', async () => {
		const payload = { sub: 'user', sid: 'session', type: 'refresh' };
		await strategy.validate(
			{ headers: { authorization: 'Bearer synthetic-token' } } as Request,
			payload,
		);
		expect(sessions.validateRefresh).toHaveBeenCalledWith(
			payload,
			'synthetic-token',
		);
	});
	it('should reject a missing token through session validation when no authorization header is present', async () => {
		sessions.validateRefresh.mockRejectedValue(new Error('Invalid'));
		await expect(
			strategy.validate({ headers: {} } as Request, {}),
		).rejects.toThrow('Invalid');
		expect(sessions.validateRefresh).toHaveBeenCalledWith({}, '');
	});
});
