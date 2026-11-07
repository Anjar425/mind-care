import { randomUUID } from 'node:crypto';
import { conflictServices } from './rule-conflicts-fixture';
import { groupUserId } from './groups-mocks';
import { DASS42_CATALOG } from '../src/reference-data/catalogs/dass42.catalog';
import type { CATEGORY, SEVERITY } from '../src/prisma/generated/enums';
import type { RuleContent } from '../src/rules/rules.types';
import type { Dass42Submission } from '../src/dass42-inference/dass42-inference.types';
import { Dass42InferenceService } from '../src/dass42-inference/dass42-inference.service';

export function inferenceRule(
	category: CATEGORY = 'DEPRESSION',
	severity: SEVERITY = 'NORMAL',
): RuleContent {
	return {
		catalogVersion: DASS42_CATALOG.catalogVersion,
		premises: [
			{
				dass42Id: 'DASS42-Q01',
				prefix: 'NO_PREFIX',
				level: 'LOW',
				joinToNext: 'THEN',
			},
		],
		conclusion: { category, severity },
	};
}
export function inferenceSubmission(score = 0): Dass42Submission {
	return {
		catalogVersion: DASS42_CATALOG.catalogVersion,
		answers: DASS42_CATALOG.questions.map((q) => ({
			dass42Id: q.id,
			score,
		})),
	};
}
export async function inferenceFixture() {
	const f = conflictServices();
	const groupId = f.m.groups.seedGroup([1, 2, 3, 4, 5]);
	for (const category of ['DEPRESSION', 'ANXIETY', 'STRESS'] as const)
		await f.rules.create(groupUserId(1), groupId, inferenceRule(category));
	return {
		...f,
		groupId,
		inference: new Dass42InferenceService(
			f.m.prisma,
			f.reference,
			f.assessment,
		),
	};
}

// Duplicate only synthetic evidence for cardinality tests; not an ingestion/production helper.
export function fillInferenceRules(
	f: Awaited<ReturnType<typeof inferenceFixture>>,
	total: number,
) {
	while (f.m.state.rules.length < total) {
		const rule = structuredClone(f.m.state.rules[0]);
		rule.id = f.m.state.nextId++;
		const revision = structuredClone(f.m.state.revisions[0]);
		revision.id = randomUUID();
		revision.ruleId = rule.id;
		f.m.state.rules.push(rule);
		f.m.state.revisions.push(revision);
	}
}
