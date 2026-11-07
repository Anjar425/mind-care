import {
	ForbiddenException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/generated/client';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { credentialEligibility } from '../expert-credentials/credential-policy';
import { ExpertProfileCompletenessService } from '../expert/expert-profile-completeness.service';
import { storedPreferencesValid } from '../expert-preferences/preferences.validation';
import type { PreferenceCatalog } from '../expert-preferences/expert-preferences.types';
import { groupTransaction } from './group-persistence';
import { MIN_VALID_EXPERTS } from './group-policy';
import type { PublicGroupQuery } from './dto/group-requests.dto';

export const ELIGIBILITY_EXPERT_SELECT = {
	id: true,
	userId: true,
	user: { select: { name: true, role: true, email_verified_at: true } },
	credentialSuspendedAt: true,
	credentialRevisions: {
		where: { status: 'APPROVED' },
		select: { type: true, status: true, expiresAt: true, holderName: true },
	},
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
	preferences: {
		select: {
			dass21Id: true,
			catalogVersion: true,
			percentDepression: true,
			percentAnxiety: true,
			percentStress: true,
		},
	},
} as const satisfies Prisma.ExpertSelect;
export const ELIGIBILITY_GROUP_SELECT = {
	id: true,
	name: true,
	description: true,
	createdAt: true,
	updatedAt: true,
	archivedAt: true,
	memberships: {
		where: { status: 'ACTIVE' },
		select: {
			expertId: true,
			role: true,
			expert: { select: ELIGIBILITY_EXPERT_SELECT },
		},
	},
} as const satisfies Prisma.GroupSelect;
export type EligibilityGroup = Prisma.GroupGetPayload<{
	select: typeof ELIGIBILITY_GROUP_SELECT;
}>;
type EligibilityExpert = Prisma.ExpertGetPayload<{
	select: typeof ELIGIBILITY_EXPERT_SELECT;
}>;

@Injectable()
export class GroupEligibilityService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly reference: ReferenceDataService,
		private readonly profiles: ExpertProfileCompletenessService,
	) {}
	evaluate(
		group: EligibilityGroup,
		catalog: PreferenceCatalog,
		now: Date,
		memo = new Map<string, boolean>(),
	) {
		const experts = new Map(
			group.memberships.map((m) => [m.expertId, m.expert]),
		);
		const validExpertIds: string[] = [];
		for (const [id, expert] of experts) {
			let eligible = memo.get(id);
			if (eligible === undefined) {
				eligible = this.expertValid(expert, catalog, now);
				memo.set(id, eligible);
			}
			if (eligible) validExpertIds.push(id);
		}
		return {
			eligible:
				group.archivedAt === null &&
				validExpertIds.length >= MIN_VALID_EXPERTS,
			activeMemberCount: experts.size,
			validExpertCount: validExpertIds.length,
			validExpertIds,
		};
	}
	private expertValid(
		expert: EligibilityExpert,
		catalog: PreferenceCatalog,
		now: Date,
	) {
		const profile = this.profiles.evaluate(expert);
		return (
			credentialEligibility(expert, now).credentialEligible &&
			profile.profileComplete &&
			profile.weightsComplete &&
			storedPreferencesValid(catalog, expert.preferences) &&
			expert.preferences.length === 21 &&
			expert.preferences.every(
				(row) => row.catalogVersion === catalog.catalogVersion,
			)
		);
	}
	private publicView(
		group: EligibilityGroup,
		state: ReturnType<GroupEligibilityService['evaluate']>,
	) {
		return {
			id: group.id,
			name: group.name,
			description: group.description,
			activeMemberCount: state.activeMemberCount,
			validExpertCount: state.validExpertCount,
			createdAt: group.createdAt,
			updatedAt: group.updatedAt,
		};
	}
	async list(q: PublicGroupQuery) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				// Evaluate the complete snapshot before slicing. Never claim an exact filtered total.
				const catalog = await this.reference.getQuestionnaire(
					'DASS21',
					tx,
				);
				const groups = await tx.group.findMany({
					where: { archivedAt: null },
					select: ELIGIBILITY_GROUP_SELECT,
				});
				const now = new Date();
				const memo = new Map<string, boolean>();
				const eligible = groups.flatMap((group) => {
					const state = this.evaluate(group, catalog, now, memo);
					return state.eligible
						? [this.publicView(group, state)]
						: [];
				});
				const direction = q.order === 'asc' ? 1 : -1;
				eligible.sort(
					(a, b) =>
						direction *
							(q.sort === 'memberCount'
								? a.activeMemberCount - b.activeMemberCount
								: a.updatedAt.getTime() -
									b.updatedAt.getTime()) || a.id - b.id,
				);
				const offset = (q.page - 1) * q.limit;
				return {
					items: eligible.slice(offset, offset + q.limit),
					page: q.page,
					limit: q.limit,
					hasNext: eligible.length > offset + q.limit,
				};
			},
			true,
		);
	}
	async publicDetail(groupId: number) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const group = await tx.group.findUnique({
					where: { id: groupId },
					select: ELIGIBILITY_GROUP_SELECT,
				});
				if (!group || group.archivedAt)
					throw new NotFoundException('Public group not found');
				const catalog = await this.reference.getQuestionnaire(
					'DASS21',
					tx,
				);
				const state = this.evaluate(group, catalog, new Date());
				if (!state.eligible)
					throw new NotFoundException('Public group not found');
				return this.publicView(group, state);
			},
			true,
		);
	}
	// Internal evaluation boundary: reuse the caller's snapshot when provided.
	// This is not an HTTP grant or a durable guarantee for a later request.
	async requireCurrent(groupId: number, db?: Prisma.TransactionClient) {
		const work = async (tx: Prisma.TransactionClient) => {
			const group = await tx.group.findUnique({
				where: { id: groupId },
				select: ELIGIBILITY_GROUP_SELECT,
			});
			if (!group) throw new NotFoundException('Group not found');
			if (group.archivedAt)
				throw new ConflictException('Group is not currently eligible');
			const catalog = await this.reference.getQuestionnaire('DASS21', tx);
			const evaluatedAt = new Date();
			const state = this.evaluate(group, catalog, evaluatedAt);
			if (!state.eligible)
				throw new ConflictException('Group is not currently eligible');
			return {
				groupId,
				validExpertIds: state.validExpertIds,
				evaluatedAt,
			};
		};
		return db ? work(db) : groupTransaction(this.prisma, work, true);
	}
	async privateAssessment(userId: string, groupId: number) {
		return groupTransaction(
			this.prisma,
			async (tx) => {
				const actor = await tx.user.findUnique({
					where: { id: userId },
					select: { role: true },
				});
				if (actor?.role !== 'EXPERT')
					throw new ForbiddenException(
						'Current expert account required',
					);
				const group = await tx.group.findUnique({
					where: { id: groupId },
					select: ELIGIBILITY_GROUP_SELECT,
				});
				if (!group) throw new NotFoundException('Group not found');
				if (!group.memberships.some((m) => m.expert.userId === userId))
					throw new ForbiddenException(
						'Active group membership required',
					);
				const catalog = await this.reference.getQuestionnaire(
					'DASS21',
					tx,
				);
				const now = new Date();
				const state = this.evaluate(group, catalog, now);
				return {
					groupId,
					eligible: state.eligible,
					activeMemberCount: state.activeMemberCount,
					validExpertCount: state.validExpertCount,
					minimumValidExperts: MIN_VALID_EXPERTS,
					evaluatedAt: now,
					members: group.memberships.map((m) => ({
						expertId: m.expertId,
						isSelf: m.expert.userId === userId,
						eligible: state.validExpertIds.includes(m.expertId),
					})),
				};
			},
			true,
		);
	}
}
