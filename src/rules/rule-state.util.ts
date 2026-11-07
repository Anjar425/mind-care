import { createHash } from 'node:crypto';
import type { Rule } from '../prisma/generated/client';
export function ruleStateHash(
	rule: Rule,
	revision: {
		id: string;
		version: number;
		antecedentHash: string;
		conclusionId: number;
	},
) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				rule.id,
				rule.groupId,
				rule.authorExpertId,
				rule.archivedAt?.toISOString() ?? null,
				revision.id,
				revision.version,
				revision.antecedentHash,
				revision.conclusionId,
			]),
		)
		.digest('hex');
}
