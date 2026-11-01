import {
	BadRequestException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Triple } from './qdss.types';

export const ALGORITHM_VERSION = 'copy-ga-v1';
export const CALIBRATION_PARAMETERS = Object.freeze({
	population: 20,
	generations: 50,
	eta: 0.25,
	lambda: 0.8,
	mutationProbability: 0.1,
	mutationSigma: 0.1,
	floor: 0.01,
});
export const MAX_CALIBRATION_SAMPLES = 100;
export const MAX_QDSS_CONTRIBUTORS = 100;
const canonical = (value: unknown): string =>
	value instanceof Date
		? JSON.stringify(value.toISOString())
		: Array.isArray(value)
			? `[${(value as unknown[]).map(canonical).join(',')}]`
			: value !== null && typeof value === 'object'
				? `{${Object.keys(value)
						.filter(
							(k) =>
								(value as Record<string, unknown>)[k] !==
								undefined,
						)
						.sort()
						.map(
							(k) =>
								`${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
						)
						.join(',')}}`
				: (JSON.stringify(value) ?? 'null');
export const digest = (value: unknown) =>
	createHash('sha256').update(canonical(value)).digest('hex');
export const record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
export function validateSamples(value: unknown): number[][] {
	if (
		!Array.isArray(value) ||
		value.length < 20 ||
		value.length > MAX_CALIBRATION_SAMPLES
	)
		throw new BadRequestException(
			`Calibration requires 20 to ${MAX_CALIBRATION_SAMPLES} complete sample sets`,
		);
	const rows: unknown[] = value;
	return rows.map((row, index) => {
		if (!Array.isArray(row) || row.length !== 21)
			throw new BadRequestException(
				`Sample ${index + 1} must contain exactly 21 scores`,
			);
		const scores: unknown[] = row;
		if (
			scores.some(
				(s) =>
					typeof s !== 'number' ||
					!Number.isInteger(s) ||
					s < 0 ||
					s > 3,
			)
		)
			throw new BadRequestException(
				`Sample ${index + 1} scores must be integers from 0 to 3`,
			);
		return [...scores] as number[];
	});
}
export function validatePreferences(value: unknown): Triple[] {
	if (!Array.isArray(value) || value.length !== 21)
		throw new ServiceUnavailableException(
			'QDSS contributor preferences are incomplete',
		);
	const rows: unknown[] = value;
	return rows.map((row) => {
		if (!Array.isArray(row) || row.length !== 3)
			throw new ServiceUnavailableException(
				'QDSS preferences require D/A/S triples',
			);
		const values: unknown[] = row;
		if (
			values.some(
				(s) =>
					typeof s !== 'number' ||
					!Number.isInteger(s) ||
					s < 0 ||
					s > 100,
			) ||
			(values as number[]).reduce((a, b) => a + b, 0) !== 100
		)
			throw new ServiceUnavailableException(
				'QDSS preference percentages must total exactly 100',
			);
		return [...values] as Triple;
	});
}
export function identifiedScores(
	value: unknown,
	ids: readonly string[],
): number[] {
	if (!Array.isArray(value) || value.length !== 21 || ids.length !== 21)
		throw new BadRequestException(
			'Exactly 21 identified DASS21 answers are required',
		);
	const rows: unknown[] = value;
	const map = new Map<string, number>();
	for (const row of rows) {
		if (
			!record(row) ||
			Object.keys(row).some((k) => !['dass21Id', 'score'].includes(k)) ||
			typeof row.dass21Id !== 'string' ||
			!ids.includes(row.dass21Id) ||
			map.has(row.dass21Id) ||
			typeof row.score !== 'number' ||
			!Number.isInteger(row.score) ||
			row.score < 0 ||
			row.score > 3
		)
			throw new BadRequestException(
				'Answers require unique current DASS21 IDs and integer scores 0–3',
			);
		map.set(row.dass21Id, row.score);
	}
	return ids.map((id) => map.get(id)!);
}
