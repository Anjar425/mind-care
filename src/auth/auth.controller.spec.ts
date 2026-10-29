import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@/common/constant/role.constant';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';

describe('AuthController', () => {
	let controller: AuthController;
	let module: TestingModule;
	let service: jest.Mocked<
		Pick<
			AuthService,
			| 'register'
			| 'login'
			| 'refresh'
			| 'logout'
			| 'sendVerificationEmail'
			| 'verifyAccount'
			| 'forgotPassword'
			| 'resetPassword'
		>
	>;
	const dto = {
		email: 'user@example.com',
		name: 'Example',
		password: 'Passw0rd123',
		confirm_password: 'Passw0rd123',
	};

	beforeEach(async () => {
		service = {
			register: jest.fn(),
			login: jest.fn(),
			refresh: jest.fn(),
			logout: jest.fn(),
			sendVerificationEmail: jest.fn(),
			verifyAccount: jest.fn(),
			forgotPassword: jest.fn(),
			resetPassword: jest.fn(),
		};
		module = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [{ provide: AuthService, useValue: service }],
		})
			.overrideGuard(JwtAuthGuard)
			.useValue({ canActivate: () => true })
			.overrideGuard(RefreshAuthGuard)
			.useValue({ canActivate: () => true })
			.compile();
		controller = module.get(AuthController);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});

	it('should be defined when service and guards are supplied', () =>
		expect(controller).toBeDefined());
	it.each([
		['userRegister', UserRole.USER],
		['expertRegister', UserRole.EXPERT],
	] as const)(
		'should force the registration role when %s is called',
		async (method, role) => {
			await controller[method](dto);
			expect(service.register).toHaveBeenCalledWith(dto, role);
		},
	);
	it.each([
		['login', UserRole.USER],
		['expertLogin', UserRole.EXPERT],
		['adminLogin', UserRole.ADMIN],
	] as const)(
		'should use the endpoint role when %s is called',
		async (method, role) => {
			await controller[method](dto);
			expect(service.login).toHaveBeenCalledWith(dto, role);
		},
	);
	it('should pass the session principal when refresh is requested', async () => {
		const user = {
			sub: 'user',
			sid: 'session',
			jti: 'token',
			email: dto.email,
			role: 'USER',
			type: 'refresh' as const,
			tokenHash: 'hash',
		};
		await controller.refresh({ user });
		expect(service.refresh).toHaveBeenCalledWith(user);
	});
	it('should pass the session identity when logout is requested', async () => {
		const user = {
			sub: 'user',
			sid: 'session',
			jti: 'token',
			email: dto.email,
			role: 'USER',
			type: 'access' as const,
		};
		await controller.logout({ user });
		expect(service.logout).toHaveBeenCalledWith(user);
	});
	it('should delegate email verification when a validated email is provided', async () => {
		await controller.sendVerification({ email: dto.email });
		expect(service.sendVerificationEmail).toHaveBeenCalledWith(dto.email);
	});
	it('should delegate token consumption when account verification is requested', async () => {
		await controller.verifyAccount({ token: 'a'.repeat(64) });
		expect(service.verifyAccount).toHaveBeenCalledWith('a'.repeat(64));
	});
	it('should delegate recovery when a validated email is provided', async () => {
		await controller.forgotPassword({ email: dto.email });
		expect(service.forgotPassword).toHaveBeenCalledWith(dto.email);
	});
	it('should delegate reset when validated token and password are provided', async () => {
		await controller.resetPassword({
			token: 'a'.repeat(64),
			newPassword: dto.password,
		});
		expect(service.resetPassword).toHaveBeenCalledWith(
			'a'.repeat(64),
			dto.password,
		);
	});
	it('should propagate the service error when login fails', async () => {
		service.login.mockRejectedValue(new Error('Safe failure'));
		await expect(controller.login(dto)).rejects.toThrow('Safe failure');
	});
});
