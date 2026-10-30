import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { CredentialRevision } from '../prisma/generated/client';

export const DAY_MS = 86_400_000;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const RETENTION_DAYS = 30;
export interface CredentialUpload {
	buffer: Buffer;
	mimetype: string;
	size: number;
}

export function expiryBoundary(value: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new BadRequestException('expiryDate must be YYYY-MM-DD');
	const date = new Date(`${value}T00:00:00.000Z`);
	if (
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== value
	)
		throw new BadRequestException(
			'expiryDate must be a real calendar date',
		);
	// Exclusive boundary: midnight after the stated date, at UTC+07:00.
	return new Date(date.getTime() + DAY_MS - 7 * 3_600_000);
}

export function numberIdentity(value: string): string {
	if (!/^[A-Za-z0-9 ./-]{1,100}$/.test(value) || value.trim() !== value)
		throw new BadRequestException(
			'number must contain ASCII letters, digits or separators without surrounding whitespace',
		);
	const comparison = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	if (!comparison)
		throw new BadRequestException('number must contain letters or digits');
	return comparison;
}

export function credentialEligibility(
	expert: {
		credentialSuspendedAt: Date | null;
		user: { name: string; role: string; email_verified_at: Date | null };
		credentialRevisions: Pick<
			CredentialRevision,
			'type' | 'status' | 'expiresAt' | 'holderName'
		>[];
	} | null,
	now = new Date(),
) {
	const reasons: string[] = [];
	if (!expert)
		return {
			credentialEligible: false,
			reasons: ['CREDENTIALS_UNSUBMITTED'],
		};
	if (expert.user.role !== 'EXPERT') reasons.push('EXPERT_ROLE_REQUIRED');
	if (!expert.user.email_verified_at) reasons.push('EMAIL_UNVERIFIED');
	if (expert.credentialSuspendedAt) reasons.push('SUSPENDED');
	for (const type of ['STR', 'SIP'] as const) {
		const approved = expert.credentialRevisions.filter(
			(r) => r.type === type && r.status === 'APPROVED',
		);
		if (approved.length !== 1) reasons.push(`${type}_APPROVAL_REQUIRED`);
		else {
			if (approved[0].expiresAt <= now) reasons.push(`${type}_EXPIRED`);
			if (approved[0].holderName !== expert.user.name)
				reasons.push(`${type}_NAME_MISMATCH`);
		}
	}
	return { credentialEligible: reasons.length === 0, reasons };
}

export function assertCredentialEligibility(
	expert: Parameters<typeof credentialEligibility>[0],
	now = new Date(),
) {
	if (!credentialEligibility(expert, now).credentialEligible)
		throw new ForbiddenException(
			'Approved, unexpired STR and SIP without suspension are required',
		);
}
