import { BadRequestException } from '@nestjs/common';
import { assertSubmission } from './dass42-inference.validation';

const submission = () => ({
	catalogVersion: 'prototype-candidate-v1',
	answers: Array.from({ length: 42 }, (_, i) => ({
		dass42Id: `DASS42-Q${String(i + 1).padStart(2, '0')}`,
		score: [0, 0.1, 1.5, 2.75, 3][i % 5],
	})),
});
describe('Strict internal identified float answer contract', () => {
	it('should accept and preserve the full unordered fractional set without coercion or rounding', () => {
		const input = submission();
		input.answers.reverse();
		const before = structuredClone(input);
		expect(() => assertSubmission(1, input)).not.toThrow();
		expect(input).toEqual(before);
	});
	it.each([
		-1,
		3.00001,
		NaN,
		Infinity,
		-Infinity,
		'1.5',
		true,
		null,
		undefined,
	])('should reject invalid score %s', (score) => {
		const input = submission() as {
			catalogVersion: string;
			answers: { dass42Id: string; score: unknown }[];
		};
		input.answers[0].score = score;
		expect(() => assertSubmission(1, input)).toThrow(BadRequestException);
	});
	it.each([
		'short',
		'long',
		'duplicate',
		'other-instrument',
		'unknown-id',
		'extra-root',
		'extra-answer',
		'null-answer',
		'missing-score',
		'invalid-release',
	])('should reject %s input', (kind) => {
		const input: Record<string, unknown> = submission();
		const rows = input.answers as Record<string, unknown>[];
		if (kind === 'short') rows.pop();
		if (kind === 'long') rows.push(rows[0]);
		if (kind === 'duplicate') rows[41] = rows[0];
		if (kind === 'other-instrument') rows[0].dass42Id = 'DASS21-Q01';
		if (kind === 'unknown-id') rows[0].dass42Id = 'DASS42-Q43';
		if (kind === 'extra-root') input.groupId = 4;
		if (kind === 'extra-answer') rows[0].patientId = 'not-allowed';
		if (kind === 'null-answer') (input.answers as unknown[])[0] = null;
		if (kind === 'missing-score') delete rows[0].score;
		if (kind === 'invalid-release') input.catalogVersion = '';
		expect(() => assertSubmission(1, input)).toThrow(BadRequestException);
	});
	it.each([0, -1, 1.5, NaN, Infinity, 2147483648])(
		'should reject invalid group id %s',
		(id) => {
			expect(() => assertSubmission(id, submission())).toThrow(
				BadRequestException,
			);
		},
	);
});
