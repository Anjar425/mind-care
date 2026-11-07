// Browser-safe contract: no Nest, Prisma, Buffer, credential or server crypto imports.
import {
	screeningPresentation,
	type ScreeningPresentation,
} from '../../screenings/client/screening-presentation';
export const LEVELS = [
	'Normal',
	'Mild',
	'Moderate',
	'Severe',
	'Extremely Severe',
] as const;
export type Category = 'depression' | 'anxiety' | 'stress';
export interface HistoryContext {
	scope: 'GLOBAL' | 'GROUP';
	group: { id: number; name: string } | null;
	catalogVersion: string;
	algorithmVersion: string;
	modelRunId?: string;
	datasetRevisionId?: string;
	configHash?: string;
	sourceHash?: string;
	evaluatedAt?: string;
}
interface HistoryDocumentBody {
	instrument: 'QDSS_DASS21' | 'DASS42_MAMDANI';
	assessedAt: string;
	context: HistoryContext;
	disclaimer: string;
	answers: { questionId: string; score: number }[];
	result: Record<string, unknown>;
}
export type HistoryDocument = HistoryDocumentBody &
	(
		| { schemaVersion: 1; presentation?: never }
		| { schemaVersion: 2; presentation: ScreeningPresentation }
	);
const categories = ['depression', 'anxiety', 'stress'] as const;
function invalid(): never {
	throw new Error('Invalid private history document');
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
	const r = value as Record<string, unknown>;
	if (
		Object.keys(r).length !== keys.length ||
		keys.some((k) => !Object.hasOwn(r, k))
	)
		invalid();
	return r;
}
function text(value: unknown, max: number): asserts value is string {
	if (
		typeof value !== 'string' ||
		!value.length ||
		value.length > max ||
		value.includes(String.fromCharCode(0))
	)
		invalid();
}
function number(
	value: unknown,
	min: number,
	max: number,
): asserts value is number {
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value < min ||
		value > max
	)
		invalid();
}
function time(value: unknown) {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	)
		invalid();
}
export function validateHistoryDocument(
	value: unknown,
): asserts value is HistoryDocument {
	const version =
		value && typeof value === 'object' && 'schemaVersion' in value
			? value.schemaVersion
			: undefined;
	const d = record(value, [
		'schemaVersion',
		'instrument',
		'assessedAt',
		'context',
		'disclaimer',
		'answers',
		'result',
		...(version === 2 ? ['presentation'] : []),
	]);
	if (
		(d.schemaVersion !== 1 && d.schemaVersion !== 2) ||
		!['QDSS_DASS21', 'DASS42_MAMDANI'].includes(d.instrument as string)
	)
		invalid();
	const qdss = d.instrument === 'QDSS_DASS21';
	time(d.assessedAt);
	text(d.disclaimer, 2000);
	const c = record(d.context, [
		'scope',
		'group',
		'catalogVersion',
		'algorithmVersion',
		...(qdss
			? ['modelRunId', 'datasetRevisionId']
			: ['configHash', 'sourceHash', 'evaluatedAt']),
	]);
	text(c.catalogVersion, 128);
	text(c.algorithmVersion, 128);
	if (c.scope === 'GROUP') {
		const group = record(c.group, ['id', 'name']);
		number(group.id, 1, 2147483647);
		if (!Number.isInteger(group.id)) invalid();
		text(group.name, 120);
	} else if (!qdss || c.scope !== 'GLOBAL' || c.group !== null) invalid();
	if (qdss) {
		text(c.modelRunId, 128);
		text(c.datasetRevisionId, 128);
	} else {
		if (
			typeof c.configHash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(c.configHash) ||
			typeof c.sourceHash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(c.sourceHash)
		)
			invalid();
		time(c.evaluatedAt);
	}
	const count = qdss ? 21 : 42;
	if (!Array.isArray(d.answers) || d.answers.length !== count) invalid();
	const expected = new Set(
		Array.from(
			{ length: count },
			(_, i) => `DASS${count}-Q${String(i + 1).padStart(2, '0')}`,
		),
	);
	for (const value of d.answers as unknown[]) {
		const a = record(value, ['questionId', 'score']);
		if (typeof a.questionId !== 'string' || !expected.delete(a.questionId))
			invalid();
		number(a.score, 0, 3);
		if (qdss && !Number.isInteger(a.score)) invalid();
	}
	const r = record(d.result, [
		...categories,
		...(qdss ? ['copyHistoryLabel'] : []),
	]);
	if (qdss) {
		for (const key of categories) number(r[key], 0, 1);
		const total = categories.reduce((sum, k) => sum + (r[k] as number), 0);
		if (
			total === 0
				? r.copyHistoryLabel !== null
				: Math.abs(total - 1) > 1e-9 ||
					!LEVELS.includes(
						r.copyHistoryLabel as (typeof LEVELS)[number],
					)
		)
			invalid();
	} else
		for (const key of categories) {
			const category = record(r[key], [
				'category',
				'score',
				'membership_degrees',
			]);
			if (category.category !== key) invalid();
			number(category.score, 0, key === 'depression' ? 42 : 41);
			const degrees = record(category.membership_degrees, [...LEVELS]);
			for (const level of LEVELS) number(degrees[level], 0, 1);
		}
	if (version === 2) {
		const presentation = record(d.presentation, [
			'version',
			'consultationRecommended',
			'qualifyingCategories',
			'message',
		]);
		const expectedPresentation = screeningPresentation(
			qdss ? 'QDSS_DASS21' : 'DASS42_MAMDANI',
			r,
		);
		if (
			presentation.version !== expectedPresentation.version ||
			presentation.consultationRecommended !==
				expectedPresentation.consultationRecommended ||
			presentation.message !== expectedPresentation.message ||
			!Array.isArray(presentation.qualifyingCategories) ||
			JSON.stringify(presentation.qualifyingCategories) !==
				JSON.stringify(expectedPresentation.qualifyingCategories)
		)
			invalid();
	}
}

export function historySeries(documents: readonly HistoryDocument[]) {
	const groups = new Map<string, HistoryDocument[]>();
	for (const document of documents) {
		validateHistoryDocument(document);
		// Keep different instruments/groups/model versions in separate comparable series.
		const c = document.context;
		const key = JSON.stringify([
			document.instrument,
			c.scope,
			c.group?.id ?? null,
			c.catalogVersion,
			c.algorithmVersion,
			c.modelRunId ?? null,
			c.configHash ?? null,
			c.sourceHash ?? null,
		]);
		const items = groups.get(key) ?? [];
		items.push(structuredClone(document));
		groups.set(key, items);
	}
	return [...groups.entries()].map(([seriesId, points]) => ({
		seriesId,
		points: points.sort((a, b) => a.assessedAt.localeCompare(b.assessedAt)),
	}));
}
