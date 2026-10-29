import {
	ConflictException,
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserReqDto } from './dto/req/create-user.req.dto';
import { UpdateUserReqDto } from './dto/req/update-user.req.dto';
import {
	assertPassword,
	normalizeEmail,
} from '@/common/utils/account-validation.util';

const SAFE_USER_SELECT = {
	id: true,
	name: true,
	email: true,
	role: true,
	created_at: true,
} as const;

@Injectable()
export class UserService {
	constructor(private readonly prismaService: PrismaService) {}

	async create(createUserDto: CreateUserReqDto) {
		assertPassword(createUserDto.password);
		const email = normalizeEmail(createUserDto.email);
		await this.assertEmailAvailable(email);
		const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
		try {
			return await this.prismaService.user.create({
				data: {
					email,
					name: createUserDto.name,
					password: hashedPassword,
					role: createUserDto.role,
					created_at: new Date(),
				},
				select: SAFE_USER_SELECT,
			});
		} catch (error: unknown) {
			this.rethrowWriteError(error);
		}
	}

	async findForAuthentication(email: string) {
		const canonical = normalizeEmail(email);
		if (!canonical) return null;
		// Include legacy surrounding whitespace, then compare exact canonical identities.
		const candidates = await this.prismaService.user.findMany({
			where: { email: { contains: canonical, mode: 'insensitive' } },
		});
		const matches = candidates.filter(
			(user) => normalizeEmail(user.email) === canonical,
		);
		return matches.length === 1 ? matches[0] : null;
	}

	async findAll() {
		const users = await this.prismaService.user.findMany({
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				created_at: true,
			},
		});

		return users;
	}

	async findOneById(id: string) {
		const user = await this.prismaService.user.findUnique({
			where: { id: id },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				created_at: true,
			},
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		return user;
	}

	async findOneByEmail(email: string) {
		const user = await this.findForAuthentication(email);

		if (!user) {
			throw new NotFoundException('User not found');
		}

		return {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			created_at: user.created_at,
		};
	}

	async update(id: string, updateUserDto: UpdateUserReqDto) {
		const user = await this.prismaService.user.findUnique({
			where: { id: id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const data: UpdateUserReqDto = { ...updateUserDto };
		if (data.email !== undefined) {
			if (typeof data.email !== 'string')
				throw new BadRequestException('email must be a string');
			data.email = normalizeEmail(data.email);
			await this.assertEmailAvailable(data.email, id);
		}

		try {
			return await this.prismaService.user.update({
				where: { id: id },
				data: data,
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					created_at: true,
				},
			});
		} catch (error: unknown) {
			this.rethrowWriteError(error);
		}
	}

	private async assertEmailAvailable(
		email: string,
		exceptId?: string,
	): Promise<void> {
		const candidates = await this.prismaService.user.findMany({
			where: { email: { contains: email, mode: 'insensitive' } },
			select: { id: true, email: true },
		});
		if (
			candidates.some(
				(user) =>
					user.id !== exceptId &&
					normalizeEmail(user.email) === email,
			)
		) {
			throw new ConflictException('Account identity already exists');
		}
	}

	private rethrowWriteError(error: unknown): never {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'P2002'
		) {
			throw new ConflictException('Account identity already exists');
		}
		throw error;
	}

	async remove(id: string) {
		const user = await this.prismaService.user.findUnique({
			where: { id: id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		await this.prismaService.user.delete({
			where: { id: id },
		});

		return;
	}
}
