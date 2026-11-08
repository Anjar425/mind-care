import { ruleStateHash } from './rule-state.util';
import type { Rule } from '../../infrastructure/prisma/generated/client';
describe('Rule comparison state', () => {
	it('should bind author/group, revision identity and lifecycle independently of a group metadata timestamp', () => {
		const rule: Rule = {
			id: 1,
			groupId: 1,
			authorExpertId: 'owner',
			createdAt: new Date(),
			updatedAt: new Date(),
			archivedAt: null,
		};
		const revision = {
			id: 'revision1',
			version: 1,
			antecedentHash: 'a'.repeat(64),
			conclusionId: 1,
		};
		const hash = ruleStateHash(rule, revision);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(ruleStateHash({ ...rule, groupId: 2 }, revision)).not.toBe(hash);
		expect(ruleStateHash(rule, { ...revision, id: 'revision2' })).not.toBe(
			hash,
		);
		expect(
			ruleStateHash({ ...rule, archivedAt: new Date() }, revision),
		).not.toBe(hash);
	});
});
