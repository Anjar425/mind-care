import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class AdminService {
	constructor(private readonly prismaService: PrismaService) {}

	async verifyExpert(uuid: string, verifiedUntil: Date) {
		const expert = await this.prismaService.expert.findUnique({
			where: { id: uuid },
		});

		if (!expert) {
			throw new NotFoundException('Expert Not Found');
		}

		this.prismaService.expert.update({
			where: { id: uuid },
			data: {
				verifiedUntil: verifiedUntil,
			},
		});

		return
	}

	
}
