import {
	ConflictException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type {
	Prisma,
	QdssConfiguration,
	QdssDataset,
} from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CredentialEligibilityService } from '../credentials/credential-eligibility.service';
import {
	configurationId,
	lockConfiguration,
	qdssAccess,
	qdssTx,
} from './qdss-persistence';
import { QdssSnapshotService, REFERENCE_ID } from './qdss-snapshot.service';
import { COPY_DEFAULTS } from './qdss.defaults';
import {
	digest,
	identifiedScores,
	validateSamples,
	validatePreferences,
} from './qdss.validation';
import type { QdssDatasetInput, QdssPageFilter } from './qdss.types';
import { withTransaction } from '../../infrastructure/prisma/transaction';

@Injectable()
export class QdssCalibrationService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly snapshots: QdssSnapshotService,
		private readonly credentials: CredentialEligibilityService,
	) {}
	async configuration(
		tx: Prisma.TransactionClient,
		groupId: number | null,
		create = false,
	) {
		const id = configurationId(groupId);
		const row = await tx.qdssConfiguration.findUnique({ where: { id } });
		if (row && row.groupId !== groupId)
			throw new ServiceUnavailableException(
				'QDSS configuration scope requires review',
			);
		if (row || !create) return row;
		return tx.qdssConfiguration.create({ data: { id, groupId } });
	}
	stateHash(
		configuration: QdssConfiguration | null,
		dataset: QdssDataset | null,
	) {
		return digest([
			configuration?.id,
			configuration?.datasetId,
			dataset?.id,
			dataset?.contentHash,
		]);
	}
	async initialize(userId: string) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				await lockConfiguration(tx, [userId], null);
				await qdssAccess(tx, userId, null, true);
				const catalog = await this.snapshots.catalog(tx);
				const existing = await tx.qdssReference.findUnique({
					where: { id: REFERENCE_ID },
				});
				if (existing) {
					if (
						existing.catalogVersion !== catalog.catalogVersion ||
						existing.sourceHash !== COPY_DEFAULTS.sourceHash ||
						digest(existing.content) !== digest(COPY_DEFAULTS.packs)
					)
						throw new ServiceUnavailableException(
							'Fixed global reference requires review',
						);
				} else {
					for (const pack of COPY_DEFAULTS.packs)
						validatePreferences(pack.preferences);
					await tx.qdssReference.create({
						data: {
							id: REFERENCE_ID,
							catalogVersion: catalog.catalogVersion,
							sourceHash: COPY_DEFAULTS.sourceHash,
							content: COPY_DEFAULTS.packs,
						},
					});
				}
				const configuration = await this.configuration(tx, null, true);
				if (!configuration)
					throw new ServiceUnavailableException(
						'Global configuration unavailable',
					);
				if (!configuration.datasetId) {
					await this.storeDataset(
						tx,
						configuration,
						catalog.catalogVersion,
						validateSamples(COPY_DEFAULTS.samples),
						userId,
					);
					await tx.qdssAudit.create({
						data: {
							configurationId: 'global',
							actorUserId: userId,
							action: 'GLOBAL_INITIALIZED',
							subjectId: REFERENCE_ID,
						},
					});
				} else {
					const selected = await this.snapshots.resolveDataset(
						tx,
						null,
					);
					this.snapshots.dataset(selected, catalog.catalogVersion);
				}
				return {
					configurationId: 'global',
					referenceId: REFERENCE_ID,
					initialized: true,
				};
			},
			qdssTx(),
		);
	}
	private async storeDataset(
		tx: Prisma.TransactionClient,
		configuration: QdssConfiguration,
		catalogVersion: string,
		samples: number[][],
		userId: string,
	) {
		const latest = await tx.qdssDataset.findFirst({
			where: { configurationId: configuration.id },
			orderBy: { version: 'desc' },
		});
		if (latest && latest.version >= 2147483647)
			throw new ConflictException('Dataset version exhausted');
		const contentHash = digest([catalogVersion, samples]);
		const row = await tx.qdssDataset.create({
			data: {
				configurationId: configuration.id,
				version: (latest?.version ?? 0) + 1,
				catalogVersion,
				samples,
				sampleCount: samples.length,
				contentHash,
				createdByUserId: userId,
			},
		});
		if (
			row.configurationId !== configuration.id ||
			row.contentHash !== contentHash ||
			digest(this.snapshots.dataset(row, catalogVersion)) !==
				digest(samples)
		)
			throw new ServiceUnavailableException('Dataset readback failed');
		await tx.qdssConfiguration.update({
			where: { id: configuration.id },
			data: { datasetId: row.id },
		});
		await tx.qdssAudit.create({
			data: {
				configurationId: configuration.id,
				actorUserId: userId,
				action: 'DATASET_REPLACED',
				subjectId: row.id,
			},
		});
		return row;
	}
	async replace(
		userId: string,
		groupId: number | null,
		dto: QdssDatasetInput,
	) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				await lockConfiguration(tx, [userId], groupId);
				await qdssAccess(tx, userId, groupId, true);
				if (groupId !== null)
					await this.credentials.require(userId, tx);
				const catalog = await this.snapshots.catalog(tx);
				if (dto.catalogVersion !== catalog.catalogVersion)
					throw new ConflictException(
						'Reload the current DASS21 catalog',
					);
				const configuration = await this.configuration(tx, groupId);
				const selected = configuration?.datasetId
					? await tx.qdssDataset.findUnique({
							where: { id: configuration.datasetId },
						})
					: null;
				if (
					dto.expectedStateHash !==
					this.stateHash(configuration, selected)
				)
					throw new ConflictException(
						'Dataset selection changed; reload before replacing',
					);
				const samples = validateSamples(
					dto.samples.map((s) =>
						identifiedScores(
							s.answers,
							catalog.questions.map((q) => q.id),
						),
					),
				);
				const owner =
					configuration ??
					(await this.configuration(tx, groupId, true));
				if (!owner)
					throw new ServiceUnavailableException(
						'QDSS configuration unavailable',
					);
				const row = await this.storeDataset(
					tx,
					owner,
					catalog.catalogVersion,
					samples,
					userId,
				);
				return {
					id: row.id,
					version: row.version,
					sampleCount: row.sampleCount,
					stateHash: this.stateHash(
						{ ...owner, datasetId: row.id },
						row,
					),
				};
			},
			qdssTx(),
		);
	}
	async read(userId: string, groupId: number | null, q: QdssPageFilter) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				await qdssAccess(tx, userId, groupId);
				const catalog = await this.snapshots.catalog(tx);
				const configuration = await this.configuration(tx, groupId);
				const selected = configuration?.datasetId
					? await tx.qdssDataset.findUnique({
							where: { id: configuration.datasetId },
						})
					: null;
				if (
					configuration?.datasetId &&
					(!selected || selected.configurationId !== configuration.id)
				)
					throw new ServiceUnavailableException(
						'Selected calibration dataset requires review',
					);
				let row: QdssDataset | null = null;
				if (q.revisionId) {
					row = await tx.qdssDataset.findUnique({
						where: { id: q.revisionId },
					});
					if (
						!row ||
						![configurationId(groupId), 'global'].includes(
							row.configurationId,
						)
					)
						throw new NotFoundException(
							'Dataset revision not found in this scope',
						);
				} else {
					const global =
						groupId === null
							? configuration
							: await this.configuration(tx, null);
					const id = selected?.id ?? global?.datasetId;
					row = id
						? await tx.qdssDataset.findUnique({ where: { id } })
						: null;
				}
				if (!row)
					return {
						source: 'UNINITIALIZED',
						revisionId: null,
						sampleCount: 0,
						catalogVersion: catalog.catalogVersion,
						stateHash: this.stateHash(configuration, selected),
						page: q.page,
						limit: q.limit,
						hasNext: false,
						items: [],
					};
				if (
					![configurationId(groupId), 'global'].includes(
						row.configurationId,
					)
				)
					throw new ServiceUnavailableException(
						'Dataset scope requires review',
					);
				const samples = this.snapshots.dataset(
					row,
					catalog.catalogVersion,
				);
				const offset = (q.page - 1) * q.limit;
				return {
					source:
						row.configurationId === 'global' ? 'GLOBAL' : 'GROUP',
					revisionId: row.id,
					version: row.version,
					sampleCount: row.sampleCount,
					catalogVersion: row.catalogVersion,
					stateHash: this.stateHash(configuration, selected),
					page: q.page,
					limit: q.limit,
					hasNext: offset + q.limit < samples.length,
					items: samples
						.slice(offset, offset + q.limit)
						.map((scores, index) => ({
							position: offset + index + 1,
							answers: scores.map((score, i) => ({
								dass21Id: catalog.questions[i].id,
								score,
							})),
						})),
				};
			},
			qdssTx(true),
		);
	}
}
