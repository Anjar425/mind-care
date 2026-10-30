import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
	credentialEligibility,
	assertCredentialEligibility,
} from './credential-policy';
import type { Prisma } from '../prisma/generated/client';

@Injectable()
export class CredentialEligibilityService {
	constructor(private readonly prisma: PrismaService) {}
	find(userId: string, db: Prisma.TransactionClient = this.prisma) {
		return db.expert.findUnique({
			where: { userId },
			include: {
				user: true,
				credentialRevisions: { where: { status: 'APPROVED' } },
			},
		});
	}
	async check(userId: string) {
		return credentialEligibility(await this.find(userId));
	}
	async require(userId: string, db: Prisma.TransactionClient = this.prisma) {
		const expert = await this.find(userId, db);
		assertCredentialEligibility(expert);
		return expert!;
	}
}
