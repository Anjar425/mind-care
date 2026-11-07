import { ConflictException, ForbiddenException } from '@nestjs/common';
export function requireRuleRead(
	authorExpertId: string,
	actorExpertId: string | null,
	activeMember: boolean,
) {
	if (authorExpertId !== actorExpertId && !activeMember)
		throw new ForbiddenException(
			'Active group membership or original authorship required',
		);
}
export function requireRuleWrite(
	scope: {
		archivedAt: Date | null;
		activeMember: boolean;
		actorExpertId: string | null;
	},
	authorExpertId?: string,
) {
	if (!scope.activeMember || !scope.actorExpertId)
		throw new ForbiddenException('Active group membership required');
	if (authorExpertId && authorExpertId !== scope.actorExpertId)
		throw new ForbiddenException(
			'Only the original author may change this rule',
		);
	if (scope.archivedAt) throw new ConflictException('Group is archived');
}
