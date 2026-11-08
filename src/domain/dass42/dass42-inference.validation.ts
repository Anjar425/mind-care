import { BadRequestException } from '@nestjs/common';
import type { Dass42Submission } from './dass42.types';

const record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function assertSubmission(
	groupId: number,
	value: unknown,
): asserts value is Dass42Submission {
	if (!Number.isSafeInteger(groupId) || groupId < 1 || groupId > 2147483647)
		throw new BadRequestException(
			'groupId must be a positive supported integer',
		);
	if (
		!record(value) ||
		Object.keys(value).some(
			(key) => !['catalogVersion', 'answers'].includes(key),
		) ||
		typeof value.catalogVersion !== 'string' ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.catalogVersion) ||
		!Array.isArray(value.answers) ||
		value.answers.length !== 42
	)
		throw new BadRequestException(
			'A catalogVersion and exactly 42 identified DASS42 answers are required',
		);
	const answers: unknown[] = value.answers;
	const seen = new Set<string>();
	for (const [index, answer] of answers.entries()) {
		if (
			!record(answer) ||
			Object.keys(answer).some(
				(key) => !['dass42Id', 'score'].includes(key),
			) ||
			typeof answer.dass42Id !== 'string' ||
			!/^DASS42-Q(0[1-9]|[1-3][0-9]|4[0-2])$/.test(answer.dass42Id) ||
			seen.has(answer.dass42Id) ||
			typeof answer.score !== 'number' ||
			!Number.isFinite(answer.score) ||
			answer.score < 0 ||
			answer.score > 3
		)
			throw new BadRequestException(
				`answers[${index}] requires a unique current DASS42 ID and a finite numeric score from 0 to 3`,
			);
		seen.add(answer.dass42Id);
	}
}
