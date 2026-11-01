import type {
	CATEGORY,
	CONJUCTION,
	LEVEL,
	PREFIX,
	SEVERITY,
} from '../prisma/generated/enums';

export interface AuthoredPremise {
	dass42Id: string;
	prefix: PREFIX;
	level: LEVEL;
	joinToNext: CONJUCTION;
}
export interface RuleContent {
	catalogVersion: string;
	premises: AuthoredPremise[];
	conclusion: { category: CATEGORY; severity: SEVERITY };
}
export type RuleAst =
	| ['TERM', string, LEVEL]
	| ['NOT', RuleAst]
	| ['AND' | 'OR', RuleAst, RuleAst];
