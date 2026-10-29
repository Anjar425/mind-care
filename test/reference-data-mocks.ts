import { DASS21_CATALOG } from '../src/reference-data/catalogs/dass21.catalog';
import { DASS42_CATALOG } from '../src/reference-data/catalogs/dass42.catalog';
import type {
	Instrument,
	StoredQuestion,
} from '../src/reference-data/reference-data.types';

export function storedQuestions(instrument: Instrument): StoredQuestion[] {
	const catalog = instrument === 'DASS21' ? DASS21_CATALOG : DASS42_CATALOG;
	return catalog.questions.map(({ id, number, text, category }) => ({
		id,
		number,
		text,
		category,
		catalogVersion: catalog.catalogVersion,
	}));
}

export function createReferencePrismaMock() {
	return {
		dASS21: {
			findMany: jest
				.fn<Promise<StoredQuestion[]>, [unknown]>()
				.mockResolvedValue(storedQuestions('DASS21')),
		},
		dASS42: {
			findMany: jest
				.fn<Promise<StoredQuestion[]>, [unknown]>()
				.mockResolvedValue(storedQuestions('DASS42')),
		},
	};
}
