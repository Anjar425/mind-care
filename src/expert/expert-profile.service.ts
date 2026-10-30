import {
	ConflictException,
	ForbiddenException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import {
	credentialTransaction,
	lockCredentialOwner,
} from '../expert-credentials/credential-transaction';
import { ExpertProfileCompletenessService } from './expert-profile-completeness.service';
import {
	assertExpertProfileSubmission,
	CAPABILITY_FIELDS,
	WEIGHT_FIELDS,
} from './expert-profile.validation';
import type { UpsertExpertProfileDto } from './dto/req/upsert-expert-profile.req.dto';
import type { Prisma } from '../prisma/generated/client';

const PROFILE_SELECT = {
	profileVersion: true,
	profileValidatedAt: true,
	education: true,
	publicationsNumber: true,
	patientsNumber: true,
	clinicalHours: true,
	weight: {
		select: {
			educationWeight: true,
			publicationWeight: true,
			patientWeight: true,
			clinicalHoursWeight: true,
		},
	},
} satisfies Prisma.ExpertSelect;

@Injectable()
export class ExpertProfileService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialEligibilityService,
		private readonly completeness: ExpertProfileCompletenessService,
	) {}
	private find(userId: string, db: Prisma.TransactionClient = this.prisma) {
		return db.expert.findUnique({
			where: { userId },
			select: PROFILE_SELECT,
		});
	}
	async read(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { role: true },
		});
		if (user?.role !== 'EXPERT')
			throw new ForbiddenException('Expert role is required');
		return this.completeness.response(await this.find(userId));
	}
	async submit(userId: string, dto: UpsertExpertProfileDto) {
		assertExpertProfileSubmission(dto);
		return credentialTransaction(this.prisma, async (tx) => {
			await lockCredentialOwner(tx, userId);
			const expert = await this.credentials.require(userId, tx);
			if (expert.profileVersion !== dto.expectedVersion)
				throw new ConflictException(
					'Profile version is stale; reload and submit the complete profile',
				);
			const now = new Date();
			const result = await tx.expert.updateMany({
				where: { id: expert.id, profileVersion: dto.expectedVersion },
				data: {
					...dto.profile,
					profileVersion: { increment: 1 },
					profileValidatedAt: now,
					updatedAt: now,
				},
			});
			if (result.count !== 1)
				throw new ConflictException(
					'Profile changed concurrently; reload',
				);
			await tx.weight.upsert({
				where: { expertId: expert.id },
				create: { expertId: expert.id, ...dto.weights },
				update: { ...dto.weights },
			});
			const saved = await this.find(userId, tx);
			if (
				!saved ||
				saved.profileVersion !== dto.expectedVersion + 1 ||
				!saved.profileValidatedAt ||
				!CAPABILITY_FIELDS.every(
					(key) => saved[key] === dto.profile[key],
				) ||
				!saved.weight ||
				!WEIGHT_FIELDS.every(
					(key) => saved.weight![key] === dto.weights[key],
				)
			)
				throw new ServiceUnavailableException(
					'Saved profile could not be verified',
				);
			return this.completeness.response(saved);
		});
	}
}
