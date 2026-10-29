import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole } from '@/common/constant/role.constant';
import { account, createPrismaMock } from '../../test/auth-mocks';
import { UserService } from './user.service';

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

	it('should create a normalized identity and safe selection when input is valid', async () => {
		await service.create(dto);
		expect(prisma.user.create).toHaveBeenCalledWith({
			data: {
				name: dto.name,
				email: 'user@example.com',
				password: expect.stringMatching(/^\$2/) as unknown,
				role: 'USER',
				created_at: expect.any(Date) as unknown,
			},
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				created_at: true,
			},
		});
		const call: unknown = prisma.user.create.mock.calls[0][0];
		if (!call || typeof call !== 'object' || !('data' in call))
			throw new Error('Missing create');
		const data = call.data as { password: string };
		expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
	});

	it('should reject creation when a legacy case or whitespace variant already exists', async () => {
		prisma.user.findMany.mockResolvedValue([
			{ id: 'existing', email: ' User@Example.com ' },
		]);
		await expect(service.create(dto)).rejects.toThrow(
			'Account identity already exists',
		);
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it('should reject creation when password exceeds the bcrypt byte limit', async () => {
		await expect(
			service.create({ ...dto, password: 'Aa1' + 'é'.repeat(35) }),
		).rejects.toThrow('72 UTF-8 bytes');
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it('should map a unique write race when the database rejects creation', async () => {
		prisma.user.create.mockRejectedValue({
			code: 'P2002',
			detail: 'PRIVATE_DB_DETAIL',
		});
		await expect(service.create(dto)).rejects.toThrow(
			'Account identity already exists',
		);
	});

	it('should propagate infrastructure failure when a write is not a uniqueness conflict', async () => {
		prisma.user.create.mockRejectedValue(new Error('Unavailable'));
		await expect(service.create(dto)).rejects.toThrow('Unavailable');
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
				created_at: true,
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
					created_at: true,
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
