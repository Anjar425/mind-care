import { BadRequestException } from '@nestjs/common';
import { Education } from '../prisma/generated/enums';
import type { UpsertExpertProfileDto } from './dto/req/upsert-expert-profile.req.dto';

export const CAPABILITY_FIELDS = [
	'education',
	'publicationsNumber',
	'patientsNumber',
	'clinicalHours',
] as const;
export const WEIGHT_FIELDS = [
	'educationWeight',
	'publicationWeight',
	'patientWeight',
	'clinicalHoursWeight',
] as const;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
export const isIntegerIn = (value: unknown, max: number): value is number =>
	typeof value === 'number' &&
	Number.isSafeInteger(value) &&
	value >= 0 &&
	value <= max;
export function validCapabilities(value: unknown): boolean {
	return (
		isRecord(value) &&
		Object.values(Education).includes(value.education as Education) &&
		CAPABILITY_FIELDS.slice(1).every((key) =>
			isIntegerIn(value[key], 2147483647),
		)
	);
}
export function validWeights(value: unknown): boolean {
	return (
		isRecord(value) &&
		WEIGHT_FIELDS.every((key) => isIntegerIn(value[key], 100)) &&
		WEIGHT_FIELDS.reduce((sum, key) => sum + (value[key] as number), 0) ===
			100
	);
}
export function assertExpertProfileSubmission(
	input: unknown,
): asserts input is UpsertExpertProfileDto {
	const errors: string[] = [];
	if (!isRecord(input))
		throw new BadRequestException(
			'A complete profile submission is required',
		);
	for (const key of Object.keys(input))
		if (!['expectedVersion', 'profile', 'weights'].includes(key))
			errors.push(`${key} is not allowed`);
	if (!isIntegerIn(input.expectedVersion, 2147483646))
		errors.push('expectedVersion must be a nonnegative supported integer');
	if (!isRecord(input.profile))
		errors.push('profile must contain all four capability values');
	else {
		for (const key of Object.keys(input.profile))
			if (!(CAPABILITY_FIELDS as readonly string[]).includes(key))
				errors.push(`profile.${key} is not allowed`);
		if (
			!Object.values(Education).includes(
				input.profile.education as Education,
			)
		)
			errors.push('profile.education must be BACHELOR, MASTER or DOCTOR');
		for (const key of CAPABILITY_FIELDS.slice(1))
			if (!isIntegerIn(input.profile[key], 2147483647))
				errors.push(
					`profile.${key} must be an integer from 0 to 2147483647`,
				);
	}
	if (!isRecord(input.weights))
		errors.push('weights must contain all four percentage factors');
	else {
		for (const key of Object.keys(input.weights))
			if (!(WEIGHT_FIELDS as readonly string[]).includes(key))
				errors.push(`weights.${key} is not allowed`);
		for (const key of WEIGHT_FIELDS)
			if (!isIntegerIn(input.weights[key], 100))
				errors.push(`weights.${key} must be an integer from 0 to 100`);
		if (
			WEIGHT_FIELDS.every((key) =>
				isIntegerIn(
					(input.weights as Record<string, unknown>)[key],
					100,
				),
			) &&
			!validWeights(input.weights)
		)
			errors.push(
				'weights must total exactly 100; values were not adjusted',
			);
	}
	if (errors.length) throw new BadRequestException(errors);
}
