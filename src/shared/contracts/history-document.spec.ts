import { historyDocument } from '../../../test/history-mocks';
import { historySeries, validateHistoryDocument } from './history-document';
import { screeningPresentation } from './screening-presentation';
describe('Private history payload and comparable graph series', () => {
	it('should keep version1 valid and validate version2 without mutating old records', () => {
		const v1 = historyDocument(true);
		const v2 = {
			...v1,
			schemaVersion: 2 as const,
			presentation: screeningPresentation(v1.instrument, v1.result),
		};
		expect(() => validateHistoryDocument(v1)).not.toThrow();
		expect(() => validateHistoryDocument(v2)).not.toThrow();
		expect(v1).not.toHaveProperty('presentation');
		expect(() =>
			validateHistoryDocument({
				...v2,
				presentation: {
					...v2.presentation,
					message: 'unapproved message',
				},
			}),
		).toThrow();
		expect(() =>
			validateHistoryDocument({ ...v1, schemaVersion: 2 }),
		).toThrow();
	});
	it.each([false, true])(
		'should retain exact complete payload for DASS42=%s',
		(dass42) => {
			const value = historyDocument(dass42);
			expect(() => validateHistoryDocument(value)).not.toThrow();
		},
	);
	it.each([
		'missing',
		'duplicate',
		'float21',
		'range42',
		'nonfinite',
		'extra',
		'category',
		'probability',
	])('should reject corrupted payload %s', (kind) => {
		const value = historyDocument(kind !== 'float21');
		if (kind === 'missing') value.answers.pop();
		if (kind === 'duplicate')
			value.answers[1].questionId = value.answers[0].questionId;
		if (kind === 'float21') value.answers[0].score = 1.5;
		if (kind === 'range42') value.answers[0].score = 3.1;
		if (kind === 'nonfinite') value.answers[0].score = NaN;
		if (kind === 'extra')
			Object.assign(value, { diagnosis: 'unsupported' });
		if (kind === 'category')
			value.result.anxiety = {
				category: 'depression',
				score: 0,
				membership_degrees: {},
			};
		if (kind === 'probability')
			value.result.anxiety = {
				category: 'anxiety',
				score: 0,
				membership_degrees: { Normal: 2 },
			};
		expect(() => validateHistoryDocument(value)).toThrow(
			'Invalid private history document',
		);
	});
	it('should preserve legitimate all-zero QDSS results and forbid fabricated labels', () => {
		const value = historyDocument();
		value.result = {
			depression: 0,
			anxiety: 0,
			stress: 0,
			copyHistoryLabel: null,
		};
		expect(() => validateHistoryDocument(value)).not.toThrow();
		value.result.copyHistoryLabel = 'Normal';
		expect(() => validateHistoryDocument(value)).toThrow();
	});
	it('should separate instrument, source and model changes and sort chronology without rewriting values', () => {
		const first = historyDocument();
		const earlier = historyDocument();
		earlier.assessedAt = '2026-11-01T00:00:00.000Z';
		const changed = historyDocument();
		changed.context.modelRunId = 'another-model';
		const series = historySeries([
			first,
			historyDocument(true),
			changed,
			earlier,
		]);
		expect(series).toHaveLength(3);
		expect(series[0].points.map((p) => p.assessedAt)).toEqual([
			earlier.assessedAt,
			first.assessedAt,
		]);
		series[0].points[0].answers[0].score = 3;
		expect(earlier.answers[0].score).toBe(1);
	});
});
