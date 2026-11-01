import {
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, QdssDataset } from '../prisma/generated/client';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import {
	ELIGIBILITY_GROUP_SELECT,
	GroupEligibilityService,
} from '../groups/group-eligibility.service';
import { COPY_DEFAULTS } from './qdss.defaults';
import {
	ALGORITHM_VERSION,
	CALIBRATION_PARAMETERS,
	digest,
	MAX_QDSS_CONTRIBUTORS,
	validatePreferences,
	validateSamples,
} from './qdss.validation';
import { configurationId } from './qdss-persistence';
import type { QdssSnapshot, Contributor } from './qdss.types';
export const REFERENCE_ID = 'copy-global-d13-v1';
@Injectable()
export class QdssSnapshotService {
	constructor(
		private readonly reference: ReferenceDataService,
		private readonly groups: GroupEligibilityService,
	) {}
	async catalog(tx: Prisma.TransactionClient) {
		return this.reference.getQuestionnaire('DASS21', tx);
	}
	dataset(row: QdssDataset, catalogVersion: string) {
		try {
			const samples = validateSamples(row.samples);
			if (
				row.catalogVersion !== catalogVersion ||
				row.sampleCount !== samples.length ||
				row.contentHash !== digest([catalogVersion, samples])
			)
				throw new Error('dataset');
			return samples;
		} catch {
			throw new ServiceUnavailableException(
				'Stored calibration dataset requires review',
			);
		}
	}
	async resolveDataset(
		tx: Prisma.TransactionClient,
		groupId: number | null,
		pinnedId?: string,
	) {
		const own = await tx.qdssConfiguration.findUnique({
			where: { id: configurationId(groupId) },
		});
		const global =
			groupId === null
				? own
				: await tx.qdssConfiguration.findUnique({
						where: { id: 'global' },
					});
		const id = pinnedId ?? own?.datasetId ?? global?.datasetId;
		if (!id)
			throw new ConflictException(
				'Calibration dataset is not initialized',
			);
		const row = await tx.qdssDataset.findUnique({ where: { id } });
		if (
			!row ||
			![configurationId(groupId), 'global'].includes(row.configurationId)
		)
			throw new ServiceUnavailableException(
				'Calibration dataset scope is invalid',
			);
		return row;
	}
	async capture(
		tx: Prisma.TransactionClient,
		groupId: number | null,
		pinnedId?: string,
	) {
		const catalog = await this.catalog(tx),
			dataset = await this.resolveDataset(tx, groupId, pinnedId);
		const samples = this.dataset(dataset, catalog.catalogVersion);
		let contributors: Contributor[];
		let referenceId: string | null = null;
		if (groupId === null) {
			const ref = await tx.qdssReference.findUnique({
				where: { id: REFERENCE_ID },
			});
			if (
				!ref ||
				ref.catalogVersion !== catalog.catalogVersion ||
				ref.sourceHash !== COPY_DEFAULTS.sourceHash ||
				digest(ref.content) !== digest(COPY_DEFAULTS.packs)
			)
				throw new ServiceUnavailableException(
					'Fixed global reference is not initialized or requires review',
				);
			referenceId = ref.id;
			contributors = COPY_DEFAULTS.packs.map((p) => ({
				id: p.id,
				preferences: validatePreferences(p.preferences),
				provenance: p.profile,
			}));
		} else {
			const group = await tx.group.findUnique({
				where: { id: groupId },
				select: ELIGIBILITY_GROUP_SELECT,
			});
			if (!group) throw new ConflictException('Group is unavailable');
			const state = this.groups.evaluate(group, catalog, new Date());
			if (!state.eligible)
				throw new ConflictException(
					'Group requires at least four currently valid experts',
				);
			const periods = await tx.groupMembership.findMany({
				where: { groupId, status: 'ACTIVE' },
				select: { id: true, expertId: true, joinedAt: true },
			});
			if (
				state.validExpertIds.some(
					(id) =>
						periods.filter((p) => p.expertId === id).length !== 1,
				)
			)
				throw new ServiceUnavailableException(
					'QDSS membership periods require review',
				);
			contributors = group.memberships
				.filter((m) => state.validExpertIds.includes(m.expertId))
				.map((m) => ({
					id: m.expertId,
					preferences: validatePreferences(
						catalog.questions.map((q) => {
							const p = m.expert.preferences.find(
								(p) => p.dass21Id === q.id,
							)!;
							return [
								p.percentDepression,
								p.percentAnxiety,
								p.percentStress,
							];
						}),
					),
					provenance: {
						userId: m.expert.userId,
						role: m.expert.user.role,
						membership: periods
							.filter((p) => p.expertId === m.expertId)
							.map((p) => [p.id, p.joinedAt.toISOString()]),
						credentials: m.expert.credentialRevisions
							.map((c) => [c.type, c.expiresAt.toISOString()])
							.sort((a, b) => (a[0] < b[0] ? -1 : 1)),
						profileVersion: m.expert.profileVersion,
						profileValidatedAt:
							m.expert.profileValidatedAt?.toISOString(),
						profile: [
							m.expert.education,
							m.expert.publicationsNumber,
							m.expert.patientsNumber,
							m.expert.clinicalHours,
						],
						weight: m.expert.weight,
					},
				}));
		}
		contributors.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		if (
			contributors.length > MAX_QDSS_CONTRIBUTORS ||
			new Set(contributors.map((c) => c.id)).size !== contributors.length
		)
			throw new ConflictException(
				'QDSS contributor count is unsupported',
			);
		const snapshot: QdssSnapshot = {
			scope: groupId === null ? 'GLOBAL' : 'GROUP',
			configurationId: configurationId(groupId),
			groupId,
			catalogVersion: catalog.catalogVersion,
			datasetId: dataset.id,
			datasetHash: dataset.contentHash,
			referenceId,
			parameters: CALIBRATION_PARAMETERS,
			contributors,
		};
		return {
			snapshot,
			samples,
			inputHash: digest([ALGORITHM_VERSION, snapshot]),
		};
	}
}
