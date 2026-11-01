import {
	ConflictException,
	ForbiddenException,
	HttpException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type Prisma as PrismaTypes } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEligibilityService } from '../expert-credentials/credential-eligibility.service';
import { lockCredentialOwner } from '../expert-credentials/credential-transaction';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { ExpertPreferencesCompletenessService } from './expert-preferences-completeness.service';
import {
	assertPreferencesSubmission,
	PREFERENCE_FIELDS,
} from './preferences.validation';
import type {
	PreferenceState,
	ReplacePreferences,
} from './expert-preferences.types';

const PREFERENCE_SELECT = {
	dass21Id: true,
	catalogVersion: true,
	percentDepression: true,
	percentAnxiety: true,
	percentStress: true,
} as const;

@Injectable()
export class ExpertPreferencesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly credentials: CredentialEligibilityService,
		private readonly references: ReferenceDataService,
		private readonly completeness: ExpertPreferencesCompletenessService,
	) {}
	private async transaction<T>(
		work: (tx: PrismaTypes.TransactionClient) => Promise<T>,
	): Promise<T> {
		try {
			return await this.prisma.$transaction(work, {
				isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
			});
		} catch (error) {
			return this.persistenceFailure(error);
		}
	}
	private persistenceFailure(error: unknown): never {
		if (error instanceof HttpException) throw error;
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			['P2002', 'P2034'].includes(error.code)
		)
			throw new ConflictException(
				'Preferences changed concurrently; reload before saving',
			);
		throw new ServiceUnavailableException(
			'Preference persistence is unavailable',
		);
	}
	private async state(
		userId: string,
		expertId: string | undefined,
		tx: PrismaTypes.TransactionClient,
	): Promise<PreferenceState> {
		const catalog = await this.references.getQuestionnaire('DASS21', tx);
		const rows = expertId
			? await tx.preferences.findMany({
					where: { expertId },
					select: PREFERENCE_SELECT,
					take: 22,
					orderBy: { dass21Id: 'asc' },
				})
			: [];
		return this.completeness.state(userId, catalog, rows);
	}
	async read(userId: string): Promise<PreferenceState> {
		return this.transaction(async (tx) => {
			const user = await tx.user.findUnique({
				where: { id: userId },
				select: { role: true },
			});
			if (user?.role !== 'EXPERT')
				throw new ForbiddenException('Expert role is required');
			const expert = await tx.expert.findUnique({
				where: { userId },
				select: { id: true },
			});
			return this.state(userId, expert?.id, tx);
		});
	}
	async replace(
		userId: string,
		dto: ReplacePreferences,
	): Promise<PreferenceState> {
		assertPreferencesSubmission(dto);
		return this.transaction(async (tx) => {
			await lockCredentialOwner(tx, userId);
			const expert = await this.credentials.require(userId, tx);
			const before = await this.state(userId, expert.id, tx);
			if (dto.catalogVersion !== before.catalogVersion)
				throw new ConflictException(
					'Question catalog changed; reload and review the current questions',
				);
			if (dto.expectedStateHash !== before.stateHash)
				throw new ConflictException(
					'Preference state is stale; reload before saving',
				);
			for (const row of dto.preferences) {
				const data = {
					catalogVersion: dto.catalogVersion,
					percentDepression: row.percentDepression,
					percentAnxiety: row.percentAnxiety,
					percentStress: row.percentStress,
				};
				await tx.preferences.upsert({
					where: {
						expertId_dass21Id: {
							expertId: expert.id,
							dass21Id: row.dass21Id,
						},
					},
					create: {
						expertId: expert.id,
						dass21Id: row.dass21Id,
						...data,
					},
					update: data,
				});
			}
			const after = await this.state(userId, expert.id, tx);
			const submitted = new Map(
				dto.preferences.map((row) => [row.dass21Id, row]),
			);
			if (
				!after.preferencesComplete ||
				!after.preferences.every((row) => {
					const intended = submitted.get(row.dass21Id);
					return (
						!!intended &&
						row.catalogVersion === dto.catalogVersion &&
						PREFERENCE_FIELDS.every(
							(key) => row[key] === intended[key],
						)
					);
				})
			)
				throw new ServiceUnavailableException(
					'Saved preference set could not be verified',
				);
			return after;
		});
	}
	// Internal composition only. No public endpoint accepts an arbitrary expert ID.
	async readCompleteForExpert(
		expertId: string,
		db?: PrismaTypes.TransactionClient,
	): Promise<PreferenceState> {
		const work = async (tx: PrismaTypes.TransactionClient) => {
			const expert = await tx.expert.findUnique({
				where: { id: expertId },
				select: { userId: true },
			});
			if (!expert) throw new NotFoundException('Expert not found');
			await this.credentials.require(expert.userId, tx);
			const state = await this.state(expert.userId, expertId, tx);
			if (!state.preferencesComplete)
				throw new ForbiddenException(
					'A complete current-catalog preference set is required',
				);
			return state;
		};
		return db
			? work(db).catch((error: unknown) => this.persistenceFailure(error))
			: this.transaction(work);
	}
}
