import {
	BadRequestException,
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import type { RuleContent } from './rules.types';

@Injectable()
export class RuleReferenceService {
	constructor(private readonly reference: ReferenceDataService) {}
	async resolveMany(
		contents: readonly RuleContent[],
		tx: Prisma.TransactionClient,
	) {
		if (!contents.length) return [];
		const catalog = await this.reference.getQuestionnaire('DASS42', tx);
		const ids = new Set(catalog.questions.map((q) => q.id));
		for (const content of contents) {
			if (content.catalogVersion !== catalog.catalogVersion)
				throw new ConflictException(
					'Reference release changed; reload the DASS42 catalog',
				);
			if (content.premises.some((p) => !ids.has(p.dass42Id)))
				throw new BadRequestException(
					'Every premise must identify a current DASS42 question',
				);
		}
		const pairs = [
			...new Map(
				contents.map((c) => [
					JSON.stringify(c.conclusion),
					{
						category: c.conclusion.category,
						severity: c.conclusion.severity,
					},
				]),
			).values(),
		];
		const rows = await tx.conclusion.findMany({
			where: { OR: pairs },
			select: { id: true, category: true, severity: true },
		});
		return contents.map((content) => {
			const row = rows.find(
				(r) =>
					r.category === content.conclusion.category &&
					r.severity === content.conclusion.severity,
			);
			if (!row)
				throw new ServiceUnavailableException(
					'Rule conclusion reference unavailable',
				);
			return row.id;
		});
	}
	async resolve(content: RuleContent, tx: Prisma.TransactionClient) {
		const catalog = await this.reference.getQuestionnaire('DASS42', tx);
		if (content.catalogVersion !== catalog.catalogVersion)
			throw new ConflictException(
				'Reference release changed; reload the DASS42 catalog',
			);
		const ids = new Set(catalog.questions.map((q) => q.id));
		if (content.premises.some((p) => !ids.has(p.dass42Id)))
			throw new BadRequestException(
				'Every premise must identify a current DASS42 question',
			);
		const conclusion = await tx.conclusion.findUnique({
			where: {
				category_severity: {
					category: content.conclusion.category,
					severity: content.conclusion.severity,
				},
			},
			select: { id: true, category: true, severity: true },
		});
		if (
			!conclusion ||
			conclusion.category !== content.conclusion.category ||
			conclusion.severity !== content.conclusion.severity
		)
			throw new ServiceUnavailableException(
				'Rule conclusion reference unavailable',
			);
		return conclusion.id;
	}
}
