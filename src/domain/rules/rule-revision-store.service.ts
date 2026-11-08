import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../../infrastructure/prisma/generated/client';
import {
	compileRule,
	GRAMMAR_VERSION,
	CANONICAL_VERSION,
} from './rule-grammar';
export const RULE_REVISION_SELECT = {
	id: true,
	ruleId: true,
	version: true,
	catalogVersion: true,
	grammarVersion: true,
	canonicalVersion: true,
	originalPayload: true,
	canonicalAntecedent: true,
	antecedentHash: true,
	conclusionId: true,
	createdAt: true,
	conclusion: { select: { category: true, severity: true } },
	premises: {
		orderBy: { position: 'asc' },
		select: {
			position: true,
			dass42Id: true,
			prefix: true,
			level: true,
			joinToNext: true,
		},
	},
} as const satisfies Prisma.RuleRevisionSelect;
export const RULE_LATEST_INCLUDE = {
	author: { select: { userId: true, user: { select: { name: true } } } },
	revisions: {
		orderBy: { version: 'desc' },
		take: 1,
		select: RULE_REVISION_SELECT,
	},
} as const satisfies Prisma.RuleInclude;
export type StoredRule = Prisma.RuleGetPayload<{
	include: typeof RULE_LATEST_INCLUDE;
}>;
export type StoredRuleRevision = Prisma.RuleRevisionGetPayload<{
	select: typeof RULE_REVISION_SELECT;
}>;

@Injectable()
export class RuleRevisionStore {
	decode(row: StoredRuleRevision, ruleId: number) {
		try {
			const compiled = compileRule(row.originalPayload);
			if (
				row.ruleId !== ruleId ||
				!Number.isSafeInteger(row.version) ||
				row.version < 1 ||
				row.grammarVersion !== GRAMMAR_VERSION ||
				row.canonicalVersion !== CANONICAL_VERSION ||
				row.catalogVersion !== compiled.original.catalogVersion ||
				row.antecedentHash !== compiled.antecedentHash ||
				JSON.stringify(row.canonicalAntecedent) !==
					JSON.stringify(compiled.antecedent) ||
				row.conclusion.category !==
					compiled.original.conclusion.category ||
				row.conclusion.severity !==
					compiled.original.conclusion.severity ||
				row.premises.length !== compiled.original.premises.length
			)
				throw new Error('Invalid stored revision');
			row.premises.forEach((p, i) => {
				const { position, ...content } = p;
				const expected = compiled.original.premises[i];
				if (
					position !== i + 1 ||
					content.dass42Id !== expected.dass42Id ||
					content.prefix !== expected.prefix ||
					content.level !== expected.level ||
					content.joinToNext !== expected.joinToNext
				)
					throw new Error('Invalid stored clause');
			});
			return {
				ruleId,
				revisionId: row.id,
				version: row.version,
				catalogVersion: row.catalogVersion,
				grammarVersion: row.grammarVersion,
				canonicalVersion: row.canonicalVersion,
				createdAt: row.createdAt,
				content: compiled.original,
			};
		} catch {
			throw new ServiceUnavailableException(
				'Stored rule revision requires review',
			);
		}
	}
	async append(
		tx: Prisma.TransactionClient,
		ruleId: number,
		version: number,
		compiled: ReturnType<typeof compileRule>,
		conclusionId: number,
		now: Date,
	) {
		const row = await tx.ruleRevision.create({
			data: {
				ruleId,
				version,
				catalogVersion: compiled.original.catalogVersion,
				grammarVersion: compiled.grammarVersion,
				canonicalVersion: compiled.canonicalVersion,
				originalPayload:
					compiled.original as unknown as Prisma.InputJsonValue,
				canonicalAntecedent: compiled.antecedent,
				antecedentHash: compiled.antecedentHash,
				conclusionId,
				createdAt: now,
				premises: {
					create: compiled.original.premises.map((p, i) => ({
						...p,
						position: i + 1,
					})),
				},
			},
			select: RULE_REVISION_SELECT,
		});
		const readback = this.decode(row, ruleId);
		if (
			row.version !== version ||
			row.conclusionId !== conclusionId ||
			JSON.stringify(readback.content) !==
				JSON.stringify(compiled.original)
		)
			throw new ServiceUnavailableException(
				'Saved rule content does not match submission',
			);
		return row;
	}
}
