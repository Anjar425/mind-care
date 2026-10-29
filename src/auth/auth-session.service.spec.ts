import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole } from '@/common/constant/role.constant';
import { hashToken } from '@/common/utils/token.util';
import { account, createPrismaMock } from '../../test/auth-mocks';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionService', () => {
	let service: AuthSessionService;
	let module: TestingModule;
	let prisma: ReturnType<typeof createPrismaMock>;
	const jwt = new JwtService();
	const safeUser = {
		id: account.id,
		name: account.name,
		email: account.email,
		role: account.role,
	};
	const claims = {
		sub: account.id,
		sid: 'session-a',
		jti: 'token-a',
		role: 'USER',
		type: 'access',
	};

	beforeEach(async () => {
		prisma = createPrismaMock();
		module = await Test.createTestingModule({
			providers: [
				AuthSessionService,
				{ provide: PrismaService, useValue: prisma },
				{ provide: JwtService, useValue: jwt },
			],
		}).compile();
		service = module.get(AuthSessionService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});

	it('should create an independent hashed session when credentials remain current', async () => {
		prisma.user.findUnique.mockResolvedValue(account);
		const first = await service.create(
			account.id,
			account.password,
			UserRole.USER,
		);
		const second = await service.create(
			account.id,
			account.password,
			UserRole.USER,
		);
		expect(first.user).toEqual(safeUser);
		expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
		expect(prisma.refreshToken.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				token: hashToken(first.refreshToken),
				userId: account.id,
			}) as unknown,
		});
		expect(jwt.decode(first.accessToken)).toEqual(
			expect.objectContaining({ type: 'access', sub: account.id }),
		);
		expect(jwt.decode(first.refreshToken)).toEqual(
			expect.objectContaining({ type: 'refresh' }),
		);
		expect(first.refreshToken).not.toBe(second.refreshToken);
		expect(prisma.$transaction).toHaveBeenCalledWith(
			expect.any(Function) as unknown,
			{
				isolationLevel: 'Serializable',
			},
		);
	});

	it.each([
		null,
		{ ...account, password: 'changed' },
		{ ...account, role: 'EXPERT' },
	])(
		'should refuse session creation when account changed after password verification (%p)',
		async (user) => {
			prisma.user.findUnique.mockResolvedValue(user);
			await expect(
				service.create(account.id, account.password, UserRole.USER),
			).rejects.toThrow('Invalid or revoked session');
			expect(prisma.refreshToken.create).not.toHaveBeenCalled();
		},
	);

	it.each([
		{},
		null,
		{ ...claims, sid: undefined },
		{ ...claims, jti: undefined },
		{ ...claims, type: 'refresh' },
		{ ...claims, role: 'UNKNOWN' },
	])(
		'should reject credentials when required session claims are invalid (%p)',
		async (payload) => {
			await expect(service.validateAccess(payload)).rejects.toThrow();
			expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
		},
	);

	it('should resolve current identity when an access session is active', async () => {
		prisma.refreshToken.findFirst.mockResolvedValue({ user: safeUser });
		expect(await service.validateAccess(claims)).toEqual({
			...claims,
			email: safeUser.email,
		});
		expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: claims.sid,
					userId: account.id,
					expiresAt: { gt: expect.any(Date) as unknown },
				},
			}),
		);
	});

	it.each([null, { user: { ...safeUser, role: 'EXPERT' } }])(
		'should reject access when the session is absent or account role changed (%p)',
		async (session) => {
			prisma.refreshToken.findFirst.mockResolvedValue(session);
			await expect(service.validateAccess(claims)).rejects.toThrow();
		},
	);

	it('should accept refresh credentials when the signed token matches stored hash', async () => {
		prisma.refreshToken.findFirst.mockResolvedValue({
			user: safeUser,
			token: hashToken('current'),
		});
		expect(
			await service.validateRefresh(
				{ ...claims, type: 'refresh' },
				'current',
			),
		).toEqual({
			...claims,
			email: safeUser.email,
			type: 'refresh',
			tokenHash: hashToken('current'),
		});
	});

	it('should revoke only the affected session when an old refresh token is reused', async () => {
		prisma.refreshToken.findFirst.mockResolvedValue({
			user: safeUser,
			token: hashToken('new'),
		});
		await expect(
			service.validateRefresh({ ...claims, type: 'refresh' }, 'old'),
		).rejects.toThrow();
		expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
			where: { id: claims.sid, userId: account.id },
		});
	});

	it('should rotate once when the current token wins the atomic update', async () => {
		const expiresAt = new Date(Date.now() + 60000);
		prisma.refreshToken.findFirst.mockResolvedValue({
			user: safeUser,
			expiresAt,
		});
		prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
		const result = await service.rotate({
			...claims,
			type: 'refresh',
			email: account.email,
			tokenHash: 'current-hash',
		});
		expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
			where: {
				id: claims.sid,
				userId: account.id,
				token: 'current-hash',
				expiresAt: { gt: expect.any(Date) as unknown },
			},
			data: { token: hashToken(result.refreshToken) },
		});
		expect(jwt.decode(result.refreshToken)).toEqual(
			expect.objectContaining({
				exp: Math.floor(expiresAt.getTime() / 1000),
			}),
		);
	});

	it('should revoke the session when a competing refresh already consumed the token', async () => {
		prisma.refreshToken.findFirst.mockResolvedValue({
			user: safeUser,
			expiresAt: new Date(Date.now() + 60000),
		});
		prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
		await expect(
			service.rotate({
				...claims,
				type: 'refresh',
				email: account.email,
				tokenHash: 'old-hash',
			}),
		).rejects.toThrow();
		expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
			where: { id: claims.sid, userId: account.id },
		});
	});

	it('should reject rotation when logout or reset already revoked the session', async () => {
		prisma.refreshToken.findFirst.mockResolvedValue(null);
		await expect(
			service.rotate({
				...claims,
				type: 'refresh',
				email: account.email,
				tokenHash: 'hash',
			}),
		).rejects.toThrow();
		expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
	});

	it('should delete only the supplied session when logout is requested', async () => {
		await service.revoke(account.id, 'session-b');
		expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
			where: { id: 'session-b', userId: account.id },
		});
	});
});
