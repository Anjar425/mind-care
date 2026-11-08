// Inputs accepted by the rule-conflict workflow. HTTP DTOs implement these shapes.
import type {
	RuleConflictStatus,
	RuleResolutionKind,
} from '../../infrastructure/prisma/generated/enums';
import type { CreateRuleInput } from '../rules/rules.types';

export interface ConflictPageFilter {
	page: number;
	limit: number;
}

export interface ConflictListFilter extends ConflictPageFilter {
	status: RuleConflictStatus;
}

export interface ConflictInboxFilter extends ConflictPageFilter {
	read: 'all' | 'unread' | 'read';
}

export interface RefreshConflictsInput {
	expectedSourceHash?: string;
}

export interface ResolutionActionInput {
	ruleId: number;
	expectedRevisionId: string;
	type: RuleResolutionKind;
	content?: CreateRuleInput;
}

export interface CreateResolutionInput {
	expectedCaseStateHash: string;
	actions: ResolutionActionInput[];
	reason: string;
}

export interface ConsentInput {
	planDigest: string;
}

export interface ReasonedConsentInput extends ConsentInput {
	reason: string;
}
