import type {
	CATEGORY,
	CONJUCTION,
	LEVEL,
	PREFIX,
	SEVERITY,
} from '../../infrastructure/prisma/generated/enums';

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

export interface RulePremiseInput {
	dass42Id: string;
	prefix: PREFIX;
	level: LEVEL;
	joinToNext: CONJUCTION;
}

export interface RuleConclusionInput {
	category: CATEGORY;
	severity: SEVERITY;
}

export interface CreateRuleInput {
	catalogVersion: string;
	premises: RulePremiseInput[];
	conclusion: RuleConclusionInput;
}

export interface UpdateRuleInput extends CreateRuleInput {
	expectedStateHash: string;
}

// Inputs accepted by the rules domain. HTTP DTOs implement these shapes.
export interface ArchiveRuleInput {
	expectedStateHash: string;
	reason: string;
}

export interface RulesPageFilter {
	page: number;
	limit: number;
}

export interface RulesFilter extends RulesPageFilter {
	category?: CATEGORY;
	lifecycle: 'active' | 'archived' | 'all';
}
