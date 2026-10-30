import { createHash } from 'node:crypto';
import { DASS21_CATALOG } from './catalogs/dass21.catalog';
import { DASS42_CATALOG } from './catalogs/dass42.catalog';

// Fingerprints computed from the approved prototype candidate files, not DB fixtures.
const sourceFingerprints = {
	DASS21: 'ee12b499d3acfa5ba095c22960706665e798bb739ad92fd3df9b01fcf2555f9e',
	DASS42: '2c9280074b04c3b60c88b81a754ecdb80a5e363e6be23ddc47e30f70d9ff667f',
};

describe('Candidate questionnaire transcription', () => {
	it.each([DASS21_CATALOG, DASS42_CATALOG])(
		'should preserve text, category and order when instrument is $instrument',
		(catalog) => {
			const content = catalog.questions.map((question) => ({
				number: question.sourceId,
				text: question.text,
				category: question.sourceCategory,
			}));
			const actual = createHash('sha256')
				.update(JSON.stringify(content))
				.digest('hex');
			expect(actual).toBe(sourceFingerprints[catalog.instrument]);
		},
	);
});
