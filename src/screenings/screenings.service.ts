import {
	ConflictException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { AccessPrincipal } from '../auth/session.types';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/generated/client';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { QdssEvaluationService } from '../qdss/qdss-evaluation.service';
import { Dass42InferenceService } from '../dass42-inference/dass42-inference.service';
import {
	validateHistoryDocument,
	type HistoryDocument,
} from '../history/client/history-document';
import { ScreeningPresentationService } from './screening-presentation.service';
import { screeningTransaction } from './screening-persistence';
import { identifiedScreening } from './screening.validation';
import type { ScreeningResponse } from './screening.types';
@Injectable()
export class ScreeningsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly references: ReferenceDataService,
		private readonly qdss: QdssEvaluationService,
		private readonly dass42: Dass42InferenceService,
		private readonly presentation: ScreeningPresentationService,
	) {}
	private async group(tx: Prisma.TransactionClient, id: number | null) {
		if (id === null) return null;
		const group = await tx.group.findUnique({
			where: { id, archivedAt: null },
			select: { id: true, name: true },
		});
		if (!group) throw new NotFoundException('Screening source unavailable');
		return { id: group.id, name: group.name };
	}
	private project(
		document: HistoryDocument,
		principal?: AccessPrincipal,
	): ScreeningResponse {
		try {
			validateHistoryDocument(document);
		} catch {
			throw new ServiceUnavailableException(
				'Screening result requires review',
			);
		}
		return {
			instrument: document.instrument,
			audience: principal ? 'ACCOUNT' : 'GUEST',
			accountId: principal?.sub ?? null,
			assessedAt: document.assessedAt,
			context: document.context,
			result: document.result,
			disclaimer: document.disclaimer,
			presentation: this.presentation.build(
				document.instrument,
				document.result,
			),
		};
	}
	evaluateQdss(input: unknown, principal?: AccessPrincipal) {
		const dto = identifiedScreening(input, 'QDSS_DASS21');
		const actor = principal ? { ...principal } : undefined;
		return screeningTransaction(this.prisma, actor, async (tx) => {
			const catalog = await this.references.getQuestionnaire(
				'DASS21',
				tx,
			);
			if (catalog.catalogVersion !== dto.catalogVersion)
				throw new ConflictException('Reload current questionnaire');
			const groupId = dto.scope === 'GLOBAL' ? null : dto.groupId!;
			const group = await this.group(tx, groupId);
			const assessedAt = new Date().toISOString();
			const output = await this.qdss.evaluate(groupId, dto.answers, tx);
			if (output.catalogVersion !== catalog.catalogVersion)
				throw new ServiceUnavailableException(
					'Screening catalog source requires review',
				);
			return this.project(
				{
					schemaVersion: 1,
					instrument: 'QDSS_DASS21',
					assessedAt,
					context: {
						scope: dto.scope,
						group,
						catalogVersion: output.catalogVersion,
						algorithmVersion: output.algorithmVersion,
						modelRunId: output.modelRunId,
						datasetRevisionId: output.datasetRevisionId,
					},
					result: output.result,
					disclaimer: output.disclaimer,
					answers: dto.answers.map((a) => ({
						questionId: a.dass21Id,
						score: a.score,
					})),
				},
				actor,
			);
		});
	}
	evaluateDass42(input: unknown, principal?: AccessPrincipal) {
		const dto = identifiedScreening(input, 'DASS42_MAMDANI');
		const actor = principal ? { ...principal } : undefined;
		return screeningTransaction(this.prisma, actor, async (tx) => {
			const group = await this.group(tx, dto.groupId);
			const assessedAt = new Date().toISOString();
			const output = await this.dass42.evaluate(
				dto.groupId,
				{ catalogVersion: dto.catalogVersion, answers: dto.answers },
				tx,
			);
			if (
				output.groupId !== dto.groupId ||
				output.catalogVersion !== dto.catalogVersion
			)
				throw new ServiceUnavailableException(
					'Screening source requires review',
				);
			return this.project(
				{
					schemaVersion: 1,
					instrument: 'DASS42_MAMDANI',
					assessedAt,
					context: {
						scope: 'GROUP',
						group,
						catalogVersion: output.catalogVersion,
						algorithmVersion: output.engineVersion,
						configHash: output.configHash,
						sourceHash: output.sourceHash,
						evaluatedAt: output.evaluatedAt.toISOString(),
					},
					result: output.result as unknown as Record<string, unknown>,
					disclaimer: output.disclaimer,
					answers: dto.answers.map((a) => ({
						questionId: a.dass42Id,
						score: a.score,
					})),
				},
				actor,
			);
		});
	}
}
