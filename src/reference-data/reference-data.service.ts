import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DASS21_CATALOG } from './catalogs/dass21.catalog';
import { DASS42_CATALOG } from './catalogs/dass42.catalog';
import {
	REFERENCE_CATEGORIES,
	DASS42_SEVERITIES,
	REFERENCE_CONCLUSIONS,
} from './catalogs/reference-metadata';
import { validateCatalog, validateConclusions } from './catalog-validator';
import { QuestionnaireResponseDto } from './dto/questionnaire-response.dto';
import type { Instrument } from './reference-data.types';

const QUESTION_SELECT = {
	id: true,
	number: true,
	text: true,
	category: true,
	catalogVersion: true,
} as const;

@Injectable()
export class ReferenceDataService {
	constructor(private readonly prisma: PrismaService) {}

	async getQuestionnaire(
		instrument: Instrument,
	): Promise<QuestionnaireResponseDto> {
		const catalog =
			instrument === 'DASS21' ? DASS21_CATALOG : DASS42_CATALOG;
		try {
			validateCatalog(catalog, instrument);
			const rows =
				instrument === 'DASS21'
					? await this.prisma.dASS21.findMany({
							select: QUESTION_SELECT,
						})
					: await this.prisma.dASS42.findMany({
							select: QUESTION_SELECT,
						});
			if (rows.length !== catalog.questions.length)
				throw new Error('Incomplete catalog');
			const byId = new Map(rows.map((row) => [row.id, row]));
			if (byId.size !== catalog.questions.length)
				throw new Error('Duplicate catalog identities');
			const questions = catalog.questions.map((expected) => {
				const row = byId.get(expected.id);
				if (
					!row ||
					row.number !== expected.number ||
					row.text !== expected.text ||
					row.category !== expected.category ||
					row.catalogVersion !== catalog.catalogVersion
				)
					throw new Error('Catalog mismatch');
				return { id: row.id, number: row.number, text: row.text };
			});
			return {
				instrument,
				catalogVersion: catalog.catalogVersion,
				questions,
			};
		} catch {
			// Never expose database errors, source paths or incomplete questionnaires.
			throw new ServiceUnavailableException(
				'Reference catalog unavailable',
			);
		}
	}

	getCategories() {
		return REFERENCE_CATEGORIES;
	}
	getDASS42SeverityLevels() {
		return DASS42_SEVERITIES;
	}
	getConclusionPairs() {
		validateConclusions(REFERENCE_CONCLUSIONS);
		// Logical pairs only: no fabricated Conclusion database IDs before ingestion.
		return REFERENCE_CONCLUSIONS;
	}
}
