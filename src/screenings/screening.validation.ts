import { BadRequestException } from '@nestjs/common';
import type { Dass42Screening, QdssScreening } from './screening.types';
const invalid = (): never => {
	throw new BadRequestException('Invalid screening request');
};
function record(value: unknown, keys: string[]) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
	const r = value as Record<string, unknown>;
	if (
		Object.keys(r).length !== keys.length ||
		keys.some((k) => !Object.hasOwn(r, k))
	)
		invalid();
	return r;
}
export function identifiedScreening(
	input: unknown,
	instrument: 'QDSS_DASS21',
): QdssScreening;
export function identifiedScreening(
	input: unknown,
	instrument: 'DASS42_MAMDANI',
): Dass42Screening;
export function identifiedScreening(
	input: unknown,
	instrument: 'QDSS_DASS21' | 'DASS42_MAMDANI',
) {
	const qdss = instrument === 'QDSS_DASS21';
	const scope =
		qdss && input && typeof input === 'object' && 'scope' in input
			? input.scope
			: undefined;
	const r = record(input, [
		'catalogVersion',
		'answers',
		...(qdss ? ['scope'] : []),
		...(!qdss || scope === 'GROUP' ? ['groupId'] : []),
	]);
	if (qdss && scope !== 'GLOBAL' && scope !== 'GROUP') invalid();
	if (
		typeof r.catalogVersion !== 'string' ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(r.catalogVersion)
	)
		invalid();
	if (
		(!qdss || scope === 'GROUP') &&
		(!Number.isSafeInteger(r.groupId) ||
			(r.groupId as number) < 1 ||
			(r.groupId as number) > 2147483647)
	)
		invalid();
	const count = qdss ? 21 : 42;
	const idKey = qdss ? 'dass21Id' : 'dass42Id';
	if (!Array.isArray(r.answers) || r.answers.length !== count) invalid();
	const remaining = new Set(
		Array.from(
			{ length: count },
			(_, i) => `DASS${count}-Q${String(i + 1).padStart(2, '0')}`,
		),
	);
	const answers = (r.answers as unknown[]).map((value) => {
		const a = record(value, [idKey, 'score']);
		if (
			typeof a[idKey] !== 'string' ||
			!remaining.delete(a[idKey]) ||
			typeof a.score !== 'number' ||
			!Number.isFinite(a.score) ||
			a.score < 0 ||
			a.score > 3 ||
			(qdss && !Number.isInteger(a.score))
		)
			invalid();
		return { [idKey]: a[idKey], score: a.score };
	});
	return {
		catalogVersion: r.catalogVersion,
		...(qdss ? { scope } : {}),
		...(!qdss || scope === 'GROUP' ? { groupId: r.groupId } : {}),
		answers,
	} as unknown as QdssScreening | Dass42Screening;
}
