import type {
	CATEGORY,
	SEVERITY,
} from '../../infrastructure/prisma/generated/enums';
import type { SourceCategory } from '../reference-data/reference-data.types';
import type { RuleAst } from '../rules/rules.types';

export type SourceSeverity =
	'Normal' | 'Mild' | 'Moderate' | 'Severe' | 'Extremely Severe';
export interface Dass42Answer {
	dass42Id: string;
	score: number;
}
export interface Dass42Submission {
	catalogVersion: string;
	answers: Dass42Answer[];
}
export interface CategoryResult {
	category: SourceCategory;
	score: number;
	membership_degrees: Record<SourceSeverity, number>;
}
export type SourceResult = Record<SourceCategory, CategoryResult>;
export interface NumericRule {
	antecedent: RuleAst;
	conclusion: { category: CATEGORY; severity: SEVERITY };
}
