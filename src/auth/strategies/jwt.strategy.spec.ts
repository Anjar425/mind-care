import { Test, TestingModule } from '@nestjs/testing';
import { AuthSessionService } from '../auth-session.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
	let module: TestingModule;
	let strategy: JwtStrategy;
	let sessions: jest.Mocked<Pick<AuthSessionService, 'validateAccess'>>;
	beforeEach(async () => {
		sessions = { validateAccess: jest.fn() };
		module = await Test.createTestingModule({
			providers: [
				JwtStrategy,
				{ provide: AuthSessionService, useValue: sessions },
			],
		}).compile();
		strategy = module.get(JwtStrategy);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});
	it('should check the persistent session when verified access claims arrive', async () => {
		const payload = { sub: 'user', sid: 'session', type: 'access' };
		await strategy.validate(payload);
		expect(sessions.validateAccess).toHaveBeenCalledWith(payload);
	});
	it('should propagate rejection when the backend session is revoked', async () => {
		sessions.validateAccess.mockRejectedValue(new Error('Revoked'));
		await expect(strategy.validate({})).rejects.toThrow('Revoked');
	});
});
