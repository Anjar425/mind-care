import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { qdssTx } from './qdss-persistence';
import { QdssModelService } from './qdss-model.service';
import { QdssSnapshotService } from './qdss-snapshot.service';
import { identifiedScores } from './qdss.validation';
import { patientResult } from './math/result';
import { withTransaction } from '../../infrastructure/prisma/transaction';
@Injectable()
export class QdssEvaluationService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly models: QdssModelService,
		private readonly snapshots: QdssSnapshotService,
	) {}
	// Internal only. Public response placement and confidential history remain separate scopes.
	async evaluate(
		groupId: number | null,
		answers: unknown,
		db?: Prisma.TransactionClient,
	) {
		const work = async (tx: Prisma.TransactionClient) => {
			const catalog = await this.snapshots.catalog(tx);
			const scores = identifiedScores(
				answers,
				catalog.questions.map((q) => q.id),
			);
			const { run, output } = await this.models.current(tx, groupId);
			return {
				modelRunId: run.id,
				datasetRevisionId: run.datasetId,
				algorithmVersion: run.algorithmVersion,
				catalogVersion: catalog.catalogVersion,
				result: patientResult(scores, output.consensus),
				disclaimer:
					'Screening support only. Relative category shares and the source-derived label are not a medical diagnosis or calibrated disease probabilities.',
			};
		};
		return db ? work(db) : withTransaction(this.prisma, work, qdssTx(true));
	}
}
