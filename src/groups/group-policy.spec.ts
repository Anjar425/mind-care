import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
	compareGroup,
	effectiveGrantStatus,
	groupStateHash,
	nextGroupUpdatedAt,
	privateGroup,
	requireMember,
} from './group-policy';
import { createGroupsMocks, groupExpertId } from '../../test/groups-mocks';

describe('Group state and authority policy', () => {
	it('should hash active membership identities/roles independently of relation order and preserve authored text', () => {
		const m = createGroupsMocks();
		m.seedGroup([1, 2]);
		const group = m.snapshotGroup(m.state.groups[0]);
		const hash = groupStateHash(group);
		group.memberships.reverse();
		expect(groupStateHash(group)).toBe(hash);
		group.name += ' ';
		expect(groupStateHash(group)).not.toBe(hash);
		expect(() => compareGroup(group, hash)).toThrow(ConflictException);
	});
	it('should reject member authority escalation and avoid spreading raw persistence fields into private projection', () => {
		const m = createGroupsMocks();
		m.seedGroup([1, 2]);
		const group = m.snapshotGroup(m.state.groups[0]);
		expect(() => requireMember(group, groupExpertId(2), true)).toThrow(
			ForbiddenException,
		);
		const result = privateGroup(group, groupExpertId(1));
		expect(result.members[0]).not.toHaveProperty('expert');
		expect(result).not.toHaveProperty('invitations');
	});
	it('should invalidate exact expiry and keep decided statuses stable', () => {
		const now = new Date();
		expect(
			effectiveGrantStatus({ status: 'PENDING', expiresAt: now }, now),
		).toBe('EXPIRED');
		expect(
			effectiveGrantStatus({ status: 'ACCEPTED', expiresAt: now }, now),
		).toBe('ACCEPTED');
	});
	it('should advance metadata/membership comparison time monotonically for same-millisecond changes or clock rollback', () => {
		const now = new Date('2026-10-30');
		expect(nextGroupUpdatedAt({ updatedAt: now }, now).getTime()).toBe(
			now.getTime() + 1,
		);
		expect(
			nextGroupUpdatedAt(
				{ updatedAt: now },
				new Date('2026-10-29'),
			).getTime(),
		).toBe(now.getTime() + 1);
	});
});
