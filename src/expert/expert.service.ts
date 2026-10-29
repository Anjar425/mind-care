import { Injectable } from '@nestjs/common';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { getVerificationStatus } from '@/common/utils/verification.util';

@Injectable()
export class ExpertService {
	constructor(private readonly prismaService: PrismaService) {}

	create(createExpertDto: CreateExpertDto) {
		return 'This action adds a new expert';
	}

	async findAll(paginationDto: PaginationDto) {
		const { page = 1, limit = 10 } = paginationDto;
		const skip = (page - 1) * limit;

		const [experts, total] = await this.prismaService.$transaction([
			this.prismaService.expert.findMany({
				skip: skip,
				take: limit,
				select: {
					id: true,
					user: { select: { name: true } },
					photo: true,
					gender: true,
					verifiedUntil: true,
				},
				orderBy: {
					userId: 'desc',
				},
			}),
			this.prismaService.expert.count(),
		]);

		const data = experts.map(({ user, ...expert }) => ({
			...expert,
			name: user.name,
			verificationStatus: getVerificationStatus(expert.verifiedUntil),
		}));

		const totalPages = Math.ceil(total / limit);
		return {
			data: data,
			meta: {
				total,
				page,
				limit,
				totalPages,
				hasNextPage: page < totalPages,
				hasPreviousPage: page > 1,
			},
		};
	}

	findOne(id: number) {
		return `This action returns a #${id} expert`;
	}

	update(id: number, updateExpertDto: UpdateExpertDto) {
		return `This action updates a #${id} expert`;
	}

	remove(id: number) {
		return `This action removes a #${id} expert`;
	}
}
