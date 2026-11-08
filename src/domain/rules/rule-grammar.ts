import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
	CATEGORY,
	CONJUCTION,
	LEVEL,
	PREFIX,
	SEVERITY,
} from '../../infrastructure/prisma/generated/enums';
import type { AuthoredPremise, RuleAst, RuleContent } from './rules.types';

export const GRAMMAR_VERSION = 'dass42-ltr-v1';
export const CANONICAL_VERSION = 'ordered-ast-v1';
export const MAX_RULE_PREMISES = 100;
const record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
function shape(
	v: unknown,
	keys: string[],
	name: string,
): asserts v is Record<string, unknown> {
	if (
		!record(v) ||
		Object.keys(v).some((k) => !keys.includes(k)) ||
		keys.some((k) => !(k in v))
	)
		throw new BadRequestException(
			`${name} must contain exactly ${keys.join(', ')}`,
		);
}
export function compileRule(input: unknown, withState = false) {
	shape(
		input,
		[
			'catalogVersion',
			'premises',
			'conclusion',
			...(withState ? ['expectedStateHash'] : []),
		],
		'Rule',
	);
	if (
		withState &&
		(typeof input.expectedStateHash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(input.expectedStateHash))
	)
		throw new BadRequestException(
			'expectedStateHash must be the current SHA-256 comparison state',
		);
	if (
		typeof input.catalogVersion !== 'string' ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.catalogVersion)
	)
		throw new BadRequestException(
			'catalogVersion must identify a reference release',
		);
	if (
		!Array.isArray(input.premises) ||
		input.premises.length < 1 ||
		input.premises.length > MAX_RULE_PREMISES
	)
		throw new BadRequestException(
			'premises must contain 1 to 100 ordered clauses',
		);
	const rows: unknown[] = input.premises;
	const premises: AuthoredPremise[] = rows.map((p, i) => {
		shape(
			p,
			['dass42Id', 'prefix', 'level', 'joinToNext'],
			`premises[${i}]`,
		);
		if (
			typeof p.dass42Id !== 'string' ||
			!/^DASS42-Q(0[1-9]|[1-3][0-9]|4[0-2])$/.test(p.dass42Id)
		)
			throw new BadRequestException(
				`premises[${i}].dass42Id must be a DASS42 question ID`,
			);
		if (
			!Object.values(PREFIX).includes(p.prefix as PREFIX) ||
			!Object.values(LEVEL).includes(p.level as LEVEL) ||
			!Object.values(CONJUCTION).includes(p.joinToNext as CONJUCTION)
		)
			throw new BadRequestException(
				`premises[${i}] contains an unsupported prefix, level or connector`,
			);
		if ((i === rows.length - 1) !== (p.joinToNext === 'THEN'))
			throw new BadRequestException(
				'Exactly one THEN is required on the final premise; earlier connectors must be AND or OR',
			);
		return {
			dass42Id: p.dass42Id,
			prefix: p.prefix as PREFIX,
			level: p.level as LEVEL,
			joinToNext: p.joinToNext as CONJUCTION,
		};
	});
	shape(input.conclusion, ['category', 'severity'], 'conclusion');
	if (
		!Object.values(CATEGORY).includes(
			input.conclusion.category as CATEGORY,
		) ||
		!Object.values(SEVERITY).includes(input.conclusion.severity as SEVERITY)
	)
		throw new BadRequestException(
			'Unsupported conclusion category or severity',
		);
	const original: RuleContent = {
		catalogVersion: input.catalogVersion,
		premises,
		conclusion: {
			category: input.conclusion.category as CATEGORY,
			severity: input.conclusion.severity as SEVERITY,
		},
	};
	const literal = (p: AuthoredPremise): RuleAst => {
		const term: RuleAst = ['TERM', p.dass42Id, p.level];
		return p.prefix === 'NOT' ? ['NOT', term] : term;
	};
	let antecedent = literal(premises[0]);
	for (let i = 1; i < premises.length; i++)
		antecedent = [
			premises[i - 1].joinToNext as 'AND' | 'OR',
			antecedent,
			literal(premises[i]),
		];
	const antecedentHash = createHash('sha256')
		.update(
			JSON.stringify([
				GRAMMAR_VERSION,
				CANONICAL_VERSION,
				original.catalogVersion,
				antecedent,
			]),
		)
		.digest('hex');
	return {
		original,
		antecedent,
		antecedentHash,
		grammarVersion: GRAMMAR_VERSION,
		canonicalVersion: CANONICAL_VERSION,
	};
}
