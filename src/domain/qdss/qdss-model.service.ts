import {
	ConflictException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type {
	Prisma,
	QdssRun,
} from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CredentialEligibilityService } from '../credentials/credential-eligibility.service';
import {
	lockConfiguration,
	configurationId,
	qdssAccess,
	qdssTx,
} from './qdss-persistence';
import { QdssCalibrationService } from './qdss-calibration.service';
import { QdssSnapshotService } from './qdss-snapshot.service';
import {
	ALGORITHM_VERSION,
	CALIBRATION_PARAMETERS,
	digest,
	record,
	validatePreferences,
} from './qdss.validation';
import { optimize, consensusForWeights } from './math/ga';
import type { QdssSnapshot, QdssOutput, Triple } from './qdss.types';
import { withTransaction } from '../../infrastructure/prisma/transaction';

@Injectable()
export class QdssModelService {
	private readonly running = new Set<string>();
	constructor(
		private readonly prisma: PrismaService,
		private readonly snapshots: QdssSnapshotService,
		private readonly calibration: QdssCalibrationService,
		private readonly credentials: CredentialEligibilityService,
	) {}
	private summary(run: QdssRun) {
		return {
			id: run.id,
			configurationId: run.configurationId,
			datasetId: run.datasetId,
			referenceId: run.referenceId,
			status: run.status,
			algorithmVersion: run.algorithmVersion,
			createdAt: run.createdAt,
			completedAt: run.completedAt,
			failureCode: run.failureCode,
		};
	}
	private decode(run: QdssRun) {
		if (
			run.algorithmVersion !== ALGORITHM_VERSION ||
			!record(run.snapshot) ||
			digest([ALGORITHM_VERSION, run.snapshot]) !== run.inputHash
		)
			throw new ServiceUnavailableException(
				'Stored QDSS source requires review',
			);
		const s = run.snapshot;
		if (
			(s.scope !== 'GLOBAL' && s.scope !== 'GROUP') ||
			(s.scope === 'GLOBAL'
				? s.groupId !== null ||
					run.configurationId !== 'global' ||
					run.referenceId === null
				: typeof s.groupId !== 'number' ||
					!Number.isInteger(s.groupId) ||
					s.groupId < 1 ||
					configurationId(s.groupId) !== run.configurationId ||
					run.referenceId !== null) ||
			digest(s.parameters) !== digest(CALIBRATION_PARAMETERS) ||
			typeof s.catalogVersion !== 'string' ||
			typeof s.datasetHash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(s.datasetHash) ||
			s.configurationId !== run.configurationId ||
			s.datasetId !== run.datasetId ||
			s.referenceId !== run.referenceId ||
			!Array.isArray(s.contributors) ||
			s.contributors.length < 4 ||
			s.contributors.length > 100
		)
			throw new ServiceUnavailableException(
				'Stored QDSS scope requires review',
			);
		const entries: unknown[] = s.contributors;
		const contributors = entries.map((c) => {
			if (!record(c) || typeof c.id !== 'string')
				throw new ServiceUnavailableException(
					'Stored contributor requires review',
				);
			return {
				id: c.id,
				preferences: validatePreferences(c.preferences),
				provenance: c.provenance,
			};
		});
		if (new Set(contributors.map((c) => c.id)).size !== contributors.length)
			throw new ServiceUnavailableException(
				'Duplicate stored contributors',
			);
		return { ...s, contributors } as unknown as QdssSnapshot;
	}
	output(run: QdssRun): QdssOutput {
		const snapshot = this.decode(run);
		if (
			run.status !== 'SUCCEEDED' ||
			!Array.isArray(run.weights) ||
			!Array.isArray(run.consensus)
		)
			throw new ConflictException('QDSS model has no successful output');
		const weights: unknown[] = run.weights;
		if (
			weights.length !== snapshot.contributors.length ||
			weights.some(
				(w) =>
					typeof w !== 'number' ||
					!Number.isFinite(w) ||
					w < 0 ||
					w > 1,
			) ||
			Math.abs((weights as number[]).reduce((a, b) => a + b, 0) - 1) >
				1e-12
		)
			throw new ServiceUnavailableException(
				'Stored model weights require review',
			);
		const rows: unknown[] = run.consensus;
		if (
			rows.length !== 21 ||
			rows.some(
				(r) =>
					!Array.isArray(r) ||
					r.length !== 3 ||
					(r as unknown[]).some(
						(v) =>
							typeof v !== 'number' ||
							!Number.isFinite(v) ||
							v < 0 ||
							v > 1,
					),
			)
		)
			throw new ServiceUnavailableException(
				'Stored consensus requires review',
			);
		const output = {
			weights: weights as number[],
			consensus: rows as Triple[],
		};
		if (
			run.outputHash !== digest(output) ||
			digest(output.consensus) !==
				digest(
					consensusForWeights(
						snapshot.contributors.map((c) => c.preferences),
						output.weights,
						snapshot.scope === 'GROUP',
					),
				)
		)
			throw new ServiceUnavailableException(
				'Stored model output requires review',
			);
		return output;
	}
	async current(tx: Prisma.TransactionClient, groupId: number | null) {
		const config = await this.calibration.configuration(tx, groupId);
		if (!config?.activeRunId)
			throw new ConflictException(
				'QDSS model is not initialized; authorized calibration is required',
			);
		const run = await tx.qdssRun.findUnique({
			where: { id: config.activeRunId },
		});
		if (!run || run.configurationId !== configurationId(groupId))
			throw new ServiceUnavailableException(
				'Active QDSS model scope is invalid',
			);
		const output = this.output(run);
		const source = await this.snapshots.capture(tx, groupId, run.datasetId);
		if (source.inputHash !== run.inputHash)
			throw new ConflictException(
				'QDSS inputs changed; authorized recalibration is required',
			);
		return { run, output, source };
	}
	async read(userId: string, groupId: number | null) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				await qdssAccess(tx, userId, groupId);
				const config = await this.calibration.configuration(
					tx,
					groupId,
				);
				let nextInputHash: string | null = null;
				let nextStatus = 'AVAILABLE';
				try {
					nextInputHash = (await this.snapshots.capture(tx, groupId))
						.inputHash;
				} catch (e) {
					if (!(e instanceof ConflictException)) throw e;
					nextStatus = 'UNAVAILABLE';
				}
				if (!config?.activeRunId)
					return {
						configurationId: configurationId(groupId),
						readiness: 'UNINITIALIZED',
						nextCalibrationStatus: nextStatus,
						nextInputHash,
						model: null,
					};
				const run = await tx.qdssRun.findUnique({
					where: { id: config.activeRunId },
				});
				if (!run || run.configurationId !== config.id)
					throw new ServiceUnavailableException(
						'Active model requires review',
					);
				const output = this.output(run);
				let readiness = 'CURRENT';
				try {
					if (
						(
							await this.snapshots.capture(
								tx,
								groupId,
								run.datasetId,
							)
						).inputHash !== run.inputHash
					)
						readiness = 'STALE_INPUT';
				} catch (e) {
					if (!(e instanceof ConflictException)) throw e;
					readiness = 'INELIGIBLE';
				}
				return {
					configurationId: config.id,
					readiness,
					nextCalibrationStatus: nextStatus,
					nextInputHash,
					model: {
						...this.summary(run),
						weights: this.decode(run).contributors.map((c, i) => ({
							contributorId: c.id,
							weight: output.weights[i],
						})),
					},
				};
			},
			qdssTx(true),
		);
	}
	async runDetail(userId: string, groupId: number | null, id: string) {
		return withTransaction(
			this.prisma,
			async (tx) => {
				await qdssAccess(tx, userId, groupId);
				const run = await tx.qdssRun.findUnique({
					where: { id, configurationId: configurationId(groupId) },
				});
				if (!run)
					throw new NotFoundException('Calibration run not found');
				this.decode(run);
				return this.summary(run);
			},
			qdssTx(true),
		);
	}
	async recalibrate(
		userId: string,
		groupId: number | null,
		expectedInputHash: string,
	) {
		const key = configurationId(groupId);
		if (this.running.has(key) || this.running.size >= 2)
			throw new ConflictException(
				'Calibration capacity is busy; retry later',
			);
		this.running.add(key);
		let run: QdssRun | undefined;
		try {
			const captured = await withTransaction(
				this.prisma,
				async (tx) => {
					await lockConfiguration(tx, [userId], groupId);
					await qdssAccess(tx, userId, groupId, true);
					if (groupId !== null)
						await this.credentials.require(userId, tx);
					const source = await this.snapshots.capture(tx, groupId);
					if (source.inputHash !== expectedInputHash)
						throw new ConflictException(
							'Calibration inputs changed; reload before computing',
						);
					const configuration = await this.calibration.configuration(
						tx,
						groupId,
						true,
					);
					if (!configuration)
						throw new ServiceUnavailableException(
							'Configuration unavailable',
						);
					const pending = await tx.qdssRun.findFirst({
						where: { configurationId: key, status: 'RUNNING' },
					});
					if (pending) {
						if (Date.now() - pending.createdAt.getTime() < 120000)
							throw new ConflictException(
								'Another calibration is already running',
							);
						await tx.qdssRun.update({
							where: { id: pending.id },
							data: {
								status: 'FAILED',
								completedAt: new Date(),
								failureCode: 'ABANDONED',
							},
						});
						await tx.qdssAudit.create({
							data: {
								configurationId: key,
								actorUserId: userId,
								action: 'RUN_ABANDONED',
								subjectId: pending.id,
							},
						});
					}
					const created = await tx.qdssRun.create({
						data: {
							configurationId: key,
							datasetId: source.snapshot.datasetId,
							referenceId: source.snapshot.referenceId,
							requestedByUserId: userId,
							inputHash: source.inputHash,
							algorithmVersion: ALGORITHM_VERSION,
							snapshot:
								source.snapshot as unknown as Prisma.InputJsonValue,
						},
					});
					this.decode(created);
					await tx.qdssAudit.create({
						data: {
							configurationId: key,
							actorUserId: userId,
							action: 'RUN_REQUESTED',
							subjectId: created.id,
						},
					});
					return { ...source, run: created };
				},
				qdssTx(),
			);
			run = captured.run;
			const output = await optimize(
				captured.snapshot.contributors.map((c) => c.preferences),
				captured.samples,
				groupId !== null,
			);
			return await withTransaction(
				this.prisma,
				async (tx) => {
					const userIds = [
						userId,
						...captured.snapshot.contributors.flatMap((c) =>
							record(c.provenance) &&
							typeof c.provenance.userId === 'string'
								? [c.provenance.userId]
								: [],
						),
					];
					await lockConfiguration(tx, userIds, groupId);
					await qdssAccess(tx, userId, groupId, true);
					if (groupId !== null)
						await this.credentials.require(userId, tx);
					const current = await tx.qdssRun.findUnique({
						where: { id: captured.run.id },
					});
					if (!current || current.status !== 'RUNNING')
						throw new ConflictException(
							'Calibration request is no longer active',
						);
					if (
						(await this.snapshots.capture(tx, groupId))
							.inputHash !== captured.inputHash
					)
						throw new ConflictException(
							'Inputs changed during calibration; request a new run',
						);
					const saved = await tx.qdssRun.update({
						where: { id: current.id },
						data: {
							status: 'SUCCEEDED',
							weights: output.weights,
							consensus: output.consensus,
							outputHash: digest(output),
							completedAt: new Date(),
						},
					});
					this.output(saved);
					await tx.qdssConfiguration.update({
						where: { id: key },
						data: { activeRunId: saved.id },
					});
					await tx.qdssAudit.create({
						data: {
							configurationId: key,
							actorUserId: userId,
							action: 'MODEL_ACTIVATED',
							subjectId: saved.id,
						},
					});
					return this.summary(saved);
				},
				qdssTx(),
			);
		} catch (error) {
			if (run)
				await withTransaction(
					this.prisma,
					async (tx) => {
						await lockConfiguration(tx, [userId], groupId);
						const current = await tx.qdssRun.findUnique({
							where: { id: run!.id },
						});
						if (current?.status === 'RUNNING') {
							await tx.qdssRun.update({
								where: { id: current.id },
								data: {
									status:
										error instanceof ConflictException
											? 'STALE'
											: 'FAILED',
									completedAt: new Date(),
									failureCode:
										error instanceof ConflictException
											? 'INPUT_CHANGED'
											: 'COMPUTE_OR_STORAGE_FAILED',
								},
							});
							await tx.qdssAudit.create({
								data: {
									configurationId: key,
									actorUserId: userId,
									action: 'RUN_FAILED',
									subjectId: current.id,
								},
							});
						}
					},
					qdssTx(),
				);
			if (
				error instanceof ConflictException ||
				error instanceof ServiceUnavailableException ||
				error instanceof NotFoundException ||
				(error && typeof error === 'object' && 'getStatus' in error)
			)
				throw error;
			throw new ServiceUnavailableException('QDSS calibration failed');
		} finally {
			this.running.delete(key);
		}
	}
}
