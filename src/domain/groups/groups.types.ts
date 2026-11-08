// Inputs accepted by the groups domain. HTTP DTOs implement these shapes.

export interface GroupPageFilter {
	page: number;
	limit: number;
}

export interface PublicGroupFilter extends GroupPageFilter {
	sort: 'updatedAt' | 'memberCount';
	order: 'asc' | 'desc';
}

export interface CreateGroupInput {
	name: string;
	description: string;
}

export interface GroupStateInput {
	expectedStateHash: string;
}

export interface UpdateGroupInput extends CreateGroupInput {
	expectedStateHash: string;
}

export interface ReasonedGroupInput extends GroupStateInput {
	reason: string;
}

export interface InviteGroupInput extends GroupStateInput {
	recipientUserId: string;
}

export interface TransferGroupInput extends GroupStateInput {
	targetExpertId: string;
}
