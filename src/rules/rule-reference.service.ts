import {
	BadRequestException,
	ConflictException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import type { Prisma } from '../prisma/generated/client';
import type { RuleContent } from './rules.types';

@Injectable()
export class RuleReferenceService {
	constructor(private readonly reference: ReferenceDataService) {}
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
				category_severty: {
					category: content.conclusion.category,
					severty: content.conclusion.severity,
				},
			},
			select: { id: true, category: true, severty: true },
		});
		if (
			!conclusion ||
			conclusion.category !== content.conclusion.category ||
			conclusion.severty !== content.conclusion.severity
		)
			throw new ServiceUnavailableException(
				'Rule conclusion reference unavailable',
			);
		return conclusion.id;
	}
}
