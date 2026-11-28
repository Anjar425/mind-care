import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { UserRole } from '@/shared/types/role';
import { account, createPrismaMock } from '../../../test/auth-mocks';
import { UserService } from './user.service';

// Real bcrypt, observable: the namespace export cannot be spied on directly.
jest.mock('bcrypt', () => {
	const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
	const hash = (data: string | Buffer, saltOrRounds: string | number) =>
		actual.hash(data, saltOrRounds);
	return { ...actual, hash: jest.fn().mockImplementation(hash) };
});

describe('UserService', () => {
	let service: UserService;
	let module: TestingModule;
	let prisma: ReturnType<typeof createPrismaMock>;
	const dto = {
		name: 'Example',
		email: ' USER@Example.com ',
		password: 'Passw0rd123',
		role: UserRole.USER,
	};
	beforeEach(async () => {
		prisma = createPrismaMock();
		prisma.user.findMany.mockResolvedValue([]);
		module = await Test.createTestingModule({
			providers: [
				UserService,
				{ provide: PrismaService, useValue: prisma },
			],
		}).compile();
		service = module.get(UserService);
	});
	afterEach(async () => {
		jest.clearAllMocks();
		await module.close();
	});

	const registrationSelect = {
		id: true,
		name: true,
		email: true,
		emailVerifiedAt: true,
	};
	const existing = {
		id: 'existing',
		name: 'Owner',
		email: ' User@Example.com ',
		emailVerifiedAt: new Date(),
	};
	function hashedPassword(): string {
		const call: unknown = prisma.user.create.mock.calls[0][0];
		if (!call || typeof call !== 'object' || !('data' in call))
			throw new Error('Missing create');
		return (call.data as { password: string }).password;
	}

	it('should create a normalized identity when the email is new', async () => {
		const created = { ...existing, id: 'new', emailVerifiedAt: null };
		prisma.user.create.mockResolvedValue(created);
		await expect(service.register(dto)).resolves.toEqual({
			created: true,
			account: created,
		});
		expect(prisma.user.create).toHaveBeenCalledWith({
			data: {
				name: dto.name,
				email: 'user@example.com',
				password: expect.stringMatching(/^\$2/) as unknown,
				role: 'USER',
				createdAt: expect.any(Date) as unknown,
			},
			select: registrationSelect,
		});
		expect(await bcrypt.compare(dto.password, hashedPassword())).toBe(true);
	});

	it('should return the existing account instead of a conflict, including legacy case or whitespace variants', async () => {
		prisma.user.findMany.mockResolvedValue([existing]);
		await expect(service.register(dto)).resolves.toEqual({
			created: false,
			account: existing,
		});
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it('should hash the password even when the email exists so both paths take the same time', async () => {
		prisma.user.findMany.mockResolvedValue([existing]);
		await service.register(dto);
		expect(jest.mocked(bcrypt.hash)).toHaveBeenCalledWith(dto.password, 10);
	});

	it('should reject registration when password exceeds the bcrypt byte limit', async () => {
		await expect(
			service.register({ ...dto, password: 'Aa1' + 'é'.repeat(35) }),
		).rejects.toThrow('72 UTF-8 bytes');
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it('should return the account that won a concurrent sign-up when the database reports a unique conflict', async () => {
		prisma.user.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([existing]);
		prisma.user.create.mockRejectedValue({
			code: 'P2002',
			detail: 'PRIVATE_DB_DETAIL',
		});
		await expect(service.register(dto)).resolves.toEqual({
			created: false,
			account: existing,
		});
	});

	it('should keep the generic conflict when a unique violation has no matching account', async () => {
		prisma.user.create.mockRejectedValue({ code: 'P2002' });
		await expect(service.register(dto)).rejects.toThrow(
			'Account identity already exists',
		);
	});

	it('should propagate infrastructure failure when a write is not a uniqueness conflict', async () => {
		prisma.user.create.mockRejectedValue(new Error('Unavailable'));
		await expect(service.register(dto)).rejects.toThrow('Unavailable');
	});

	it('should resolve legacy email when exactly one canonical identity matches', async () => {
		prisma.user.findMany.mockResolvedValue([
			{ ...account, email: ' USER@Example.com ' },
			{ ...account, id: 'other', email: 'otheruser@example.com' },
		]);
		expect(await service.findForAuthentication(dto.email)).toEqual(
			expect.objectContaining({ id: account.id }),
		);
	});

	it('should reject ambiguous identity when two legacy records normalize to the same email', async () => {
		prisma.user.findMany.mockResolvedValue([
			account,
			{ ...account, id: 'other', email: ' USER@EXAMPLE.COM ' },
		]);
		expect(await service.findForAuthentication(dto.email)).toBeNull();
	});

	it('should avoid an unbounded lookup when canonical email is empty', async () => {
		expect(await service.findForAuthentication('  ')).toBeNull();
		expect(prisma.user.findMany).not.toHaveBeenCalled();
	});

	it('should return safe fields when finding one user by normalized email', async () => {
		prisma.user.findMany.mockResolvedValue([account]);
		const result = await service.findOneByEmail(dto.email);
		expect(result.id).toBe(account.id);
		expect(result).not.toHaveProperty('password');
	});

	it('should reject lookup when email does not identify an account', async () => {
		await expect(
			service.findOneByEmail('unknown@example.com'),
		).rejects.toThrow('User not found');
	});

	it('should normalize updated email when identity is available', async () => {
		prisma.user.findUnique.mockResolvedValue(account);
		await service.update(account.id, { email: ' NEW@Example.com ' });
		expect(prisma.user.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { email: 'new@example.com' } }),
		);
	});

	it('should reject update when another account owns the normalized identity', async () => {
		prisma.user.findUnique.mockResolvedValue(account);
		prisma.user.findMany.mockResolvedValue([
			{ id: 'other', email: 'NEW@Example.com' },
		]);
		await expect(
			service.update(account.id, { email: 'new@example.com' }),
		).rejects.toThrow('Account identity already exists');
		expect(prisma.user.update).not.toHaveBeenCalled();
	});

	it('should reject null identity when a partial update bypasses string validation', async () => {
		prisma.user.findUnique.mockResolvedValue(account);
		await expect(
			service.update(account.id, { email: null } as unknown as {
				email: string;
			}),
		).rejects.toThrow('email must be a string');
		expect(prisma.user.update).not.toHaveBeenCalled();
	});

	it('should reject update when the account does not exist', async () => {
		prisma.user.findUnique.mockResolvedValue(null);
		await expect(
			service.update(account.id, { name: 'Changed' }),
		).rejects.toThrow('User not found');
	});

	it('should return users when findAll is requested without exposing password fields', async () => {
		await service.findAll();
		expect(prisma.user.findMany).toHaveBeenCalledWith({
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				createdAt: true,
			},
		});
	});

	it('should reject an unknown id when finding one account', async () => {
		prisma.user.findUnique.mockResolvedValue(null);
		await expect(service.findOneById('missing')).rejects.toThrow(
			'User not found',
		);
	});

	it('should return safe selection when an account id exists', async () => {
		prisma.user.findUnique.mockResolvedValue({
			id: account.id,
			email: account.email,
		});
		expect(await service.findOneById(account.id)).toEqual({
			id: account.id,
			email: account.email,
		});
		expect(prisma.user.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					createdAt: true,
				},
			}),
		);
	});

	it('should delete the matching account when removal finds an existing id', async () => {
		prisma.user.findUnique.mockResolvedValue(account);
		await service.remove(account.id);
		expect(prisma.user.delete).toHaveBeenCalledWith({
			where: { id: account.id },
		});
	});

	it('should reject removal when the account does not exist', async () => {
		prisma.user.findUnique.mockResolvedValue(null);
		await expect(service.remove('missing')).rejects.toThrow(
			'User not found',
		);
		expect(prisma.user.delete).not.toHaveBeenCalled();
	});
});
