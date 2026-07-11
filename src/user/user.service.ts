import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserReqDto } from './dto/req/create-user.req.dto';
import { UpdateUserReqDto } from './dto/req/update-user.req.dto';

@Injectable()
export class UserService {
	constructor(private readonly prismaService: PrismaService) {}

	async create(createUserDto: CreateUserReqDto) {
		const existingUser = await this.prismaService.user.findUnique({
			where: { email: createUserDto.email },
		});

		if (existingUser) {
			throw new ConflictException('User already exists');
		}

		const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

		const user = await this.prismaService.user.create({
			data: {
				email: createUserDto.email,
				name: createUserDto.name,
				password: hashedPassword,
				role: createUserDto.role,
				created_at: new Date(),
			},
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				created_at: true,
			},
		});

		return user;
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
		const user = await this.prismaService.user.findUnique({
			where: { email: email },
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

	async update(id: string, updateUserDto: UpdateUserReqDto) {
		const user = await this.prismaService.user.findUnique({
			where: { id: id },
		});

		if (!user) {
			throw new NotFoundException('User not found');
		}

		let data: UpdateUserReqDto = { ...updateUserDto };

		const updatedUser = await this.prismaService.user.update({
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

		return updatedUser;
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
