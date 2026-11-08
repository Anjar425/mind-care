import { requireRuleRead, requireRuleWrite } from './rule-policy';
describe('Rule authority policy', () => {
	it('should allow original author history without permitting another former member', () => {
		expect(() => requireRuleRead('owner', 'owner', false)).not.toThrow();
		expect(() => requireRuleRead('owner', 'other', false)).toThrow();
		expect(() => requireRuleRead('owner', 'member', true)).not.toThrow();
	});
	it('should reject archived writes, absent membership and non-author leadership equally', () => {
		const scope = {
			archivedAt: null,
			activeMember: true,
			actorExpertId: 'member',
		};
		expect(() => requireRuleWrite(scope, 'owner')).toThrow();
		expect(() =>
			requireRuleWrite({ ...scope, activeMember: false }),
		).toThrow();
		expect(() =>
			requireRuleWrite({ ...scope, archivedAt: new Date() }),
		).toThrow();
		expect(() => requireRuleWrite(scope, 'member')).not.toThrow();
	});
});
