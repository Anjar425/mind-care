import { RuleRevisionStore } from '../src/rules/rule-revision-store.service';
import { RuleReferenceService } from '../src/rules/rule-reference.service';
import { RulesService } from '../src/rules/rules.service';
import { ReferenceDataService } from '../src/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/expert-credentials/credential-eligibility.service';
import { RuleConflictCoreService } from '../src/rule-conflicts/rule-conflict-core.service';
import { RuleResolutionService } from '../src/rule-conflicts/rule-resolution.service';
import { RuleConflictsService } from '../src/rule-conflicts/rule-conflicts.service';
import { Dass42RuleAssessmentService } from '../src/rule-conflicts/dass42-rule-assessment.service';
import { GroupEligibilityService } from '../src/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/expert/expert-profile-completeness.service';
import { groupUserId } from './groups-mocks';
import { createRulesMocks, validRuleContent } from './rules-mocks';

export function conflictServices(m = createRulesMocks()) {
	const store = new RuleRevisionStore(),
		core = new RuleConflictCoreService(store),
		reference = new ReferenceDataService(m.prisma),
		credentials = new CredentialEligibilityService(m.prisma),
		refs = new RuleReferenceService(reference);
	const rules = new RulesService(m.prisma, credentials, refs, store, core),
		resolutions = new RuleResolutionService(
			m.prisma,
			core,
			credentials,
			refs,
			store,
		),
		conflicts = new RuleConflictsService(
			m.prisma,
			core,
			resolutions,
			credentials,
			store,
		);
	const groups = new GroupEligibilityService(
		m.prisma,
		reference,
		new ExpertProfileCompletenessService(),
	);
	const assessment = new Dass42RuleAssessmentService(
		m.prisma,
		groups,
		core,
		refs,
	);
	return {
		m,
		store,
		core,
		reference,
		credentials,
		refs,
		rules,
		resolutions,
		conflicts,
		assessment,
	};
}
export async function conflictFixture() {
	const f = conflictServices();
	const groupId = f.m.groups.seedGroup([1, 2, 3, 4, 5]);
	const a = await f.rules.create(groupUserId(1), groupId, validRuleContent());
	const content = validRuleContent();
	content.conclusion.severity = 'MILD';
	const b = await f.rules.create(groupUserId(2), groupId, content);
	const record = f.m.conflicts.state.case[0];
	const caseId = record.id;
	const proposal = () =>
		f.resolutions.create(groupUserId(1), groupId, caseId, {
			expectedCaseStateHash: f.core.caseHash(
				record as unknown as Parameters<typeof f.core.caseHash>[0],
			),
			reason: 'Align contradictory severity after professional review',
			actions: [
				{
					ruleId: b.id,
					expectedRevisionId: f.m.state.revisions.find(
						(r) => r.ruleId === b.id,
					)!.id,
					type: 'REVISE',
					content: validRuleContent(),
				},
			],
		});
	// Use hydrated case data when computing its public comparison token.
	return { ...f, groupId, a, b, caseId, proposal };
}
