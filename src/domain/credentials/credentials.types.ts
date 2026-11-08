// Inputs accepted by the credential domain. HTTP DTOs implement these shapes.

export enum ReviewDecision {
	APPROVE = 'APPROVE',
	REJECT = 'REJECT',
}

export interface SubmitCredentialInput {
	number: string;
	holderName: string;
	expiryDate: string;
	expectedVersion: number;
}

export interface ReviewCredentialInput {
	decision: ReviewDecision;
	expectedVersion: number;
	digest: string;
	documentMatches: boolean;
	reason: string;
}

export interface CredentialActionInput {
	expectedVersion: number;
	reason: string;
}

export interface CredentialQueueInput {
	skip: number;
	take: number;
}
