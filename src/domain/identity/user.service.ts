import {
	ConflictException,
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import type {
	CreateUserInput,
	RegistrationOutcome,
	UpdateUserInput,
} from './identity.types';
import { hasDatabaseCode } from '../../infrastructure/prisma/transaction';
import {
	assertPassword,
	normalizeEmail,
} from '@/domain/identity/account-validation.util';

const REGISTRATION_SELECT = {
	id: true,
	name: true,
	email: true,
	emailVerifiedAt: true,
} as const;

@Injectable()
export class UserService {
	constructor(private readonly prismaService: PrismaService) {}

	/**
	 * Public sign-up that does not reveal whether the email is registered (API-001): the password
	 * is hashed in every case (bcrypt dominates the time), and an existing account, including one
	 * that wins a concurrent insert, is returned instead of a 409. The caller decides which email to
	 * send; the HTTP response is the same either way.
	 */
	async register(input: CreateUserInput): Promise<RegistrationOutcome> {
		assertPassword(input.password);
		const email = normalizeEmail(input.email);
		const hashedPassword = await bcrypt.hash(input.password, 10);
		const existing = await this.findExisting(email);
		if (existing) return { created: false, account: existing };
		try {
			const account = await this.prismaService.user.create({
				data: {
					email,
					name: input.name,
					password: hashedPassword,
					role: input.role,
					createdAt: new Date(),
				},
				select: REGISTRATION_SELECT,
			});
			return { created: true, account };
		} catch (error: unknown) {
			if (hasDatabaseCode(error, 'P2002')) {
				const raced = await this.findExisting(email);
				if (raced) return { created: false, account: raced };
			}
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
				createdAt: true,
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
				createdAt: true,
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
			createdAt: user.createdAt,
		};
	}

	async update(id: string, updateUserDto: UpdateUserInput) {
		const user = await this.prismaService.user.findUnique({
			where: { id: id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		const data: UpdateUserInput = { ...updateUserDto };
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
					createdAt: true,
				},
			});
		} catch (error: unknown) {
			this.rethrowWriteError(error);
		}
	}

	/** First account whose canonical email matches, including legacy case/whitespace variants. */
	private async findExisting(email: string) {
		const candidates = await this.prismaService.user.findMany({
			where: { email: { contains: email, mode: 'insensitive' } },
			select: REGISTRATION_SELECT,
		});
		return (
			candidates.find((user) => normalizeEmail(user.email) === email) ??
			null
		);
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
