import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
	credentialEligibility,
	assertCredentialEligibility,
	expiryBoundary,
	numberIdentity,
} from './credential-policy';

const now = new Date('2026-10-30T17:00:00Z');
const approved = () => ({
	credentialSuspendedAt: null as Date | null,
	user: {
		name: 'Example Expert',
		role: 'EXPERT',
		email_verified_at: now as Date | null,
	},
	credentialRevisions: (['STR', 'SIP'] as const).map((type) => ({
		type,
		status: 'APPROVED' as const,
		holderName: 'Example Expert',
		expiresAt: new Date('2027-01-01T00:00:00Z'),
	})),
});
describe('Credential policy', () => {
	it('should use the exclusive next midnight Jakarta boundary when an expiry date is supplied', () => {
		expect(expiryBoundary('2027-12-12').toISOString()).toBe(
			'2027-12-12T17:00:00.000Z',
		);
	});
	it.each([
		'2027-02-29',
		'2027-13-01',
		'2027-01-32',
		'12/12/2027',
		'2027-1-1',
		'invalid',
	])('should reject impossible or ambiguous expiry date %s', (value) => {
		expect(() => expiryBoundary(value)).toThrow(BadRequestException);
	});
	it('should accept a leap date when it exists', () => {
		expect(expiryBoundary('2028-02-29').toISOString()).toBe(
			'2028-02-29T17:00:00.000Z',
		);
	});
	it('should canonicalize comparison identity without modifying the submitted original', () => {
		const original = 'STR-12.34 / 5';
		expect(numberIdentity(original)).toBe('STR12345');
		expect(original).toBe('STR-12.34 / 5');
	});
	it.each(['', '   ', '/.-', 'STR_1', ' STR-1', 'ＳＴＲ1'])(
		'should reject unsupported credential number %s',
		(value) => {
			expect(() => numberIdentity(value)).toThrow(BadRequestException);
		},
	);
	it('should require both independent approvals when determining credential eligibility', () => {
		expect(credentialEligibility(approved(), now)).toEqual({
			credentialEligible: true,
			reasons: [],
		});
		expect(credentialEligibility(null, now).credentialEligible).toBe(false);
	});
	it.each(['STR', 'SIP'] as const)(
		'should stop contribution exactly at the %s expiry boundary',
		(type) => {
			const expert = approved();
			expert.credentialRevisions.find(
				(row) => row.type === type,
			)!.expiresAt = now;
			expect(credentialEligibility(expert, now).reasons).toContain(
				`${type}_EXPIRED`,
			);
		},
	);
	it('should retain the old approval when an unapproved renewal exists', () => {
		const expert = approved();
		expect(
			credentialEligibility(
				{
					...expert,
					credentialRevisions: [
						...expert.credentialRevisions,
						{ ...expert.credentialRevisions[0], status: 'PENDING' },
					],
				},
				now,
			).credentialEligible,
		).toBe(true);
	});
	it('should deny after old expiry when its replacement remains pending', () => {
		const expert = approved();
		expert.credentialRevisions[0].expiresAt = now;
		expect(
			credentialEligibility(
				{
					...expert,
					credentialRevisions: [
						...expert.credentialRevisions,
						{
							...expert.credentialRevisions[0],
							status: 'PENDING',
							expiresAt: new Date('2028-01-01'),
						},
					],
				},
				now,
			).credentialEligible,
		).toBe(false);
	});
	it('should fail closed on duplicate effective approvals', () => {
		const expert = approved();
		expert.credentialRevisions.push(expert.credentialRevisions[0]);
		expect(credentialEligibility(expert, now).credentialEligible).toBe(
			false,
		);
	});
	it('should deny suspension even when both documents are valid', () => {
		expect(
			credentialEligibility(
				{ ...approved(), credentialSuspendedAt: now },
				now,
			).reasons,
		).toContain('SUSPENDED');
	});
	it('should invalidate the old matched name when account identity changes', () => {
		const expert = approved();
		expert.user.name = 'Changed';
		expect(credentialEligibility(expert, now).reasons).toContain(
			'STR_NAME_MISMATCH',
		);
	});
	it('should reject revoked role or email verification without relying on a scheduler', () => {
		const expert = approved();
		expert.user.role = 'USER';
		expert.user.email_verified_at = null;
		expect(credentialEligibility(expert, now).reasons).toEqual(
			expect.arrayContaining([
				'EMAIL_UNVERIFIED',
				'EXPERT_ROLE_REQUIRED',
			]),
		);
	});
	it('should throw an authorization error when required credentials are missing', () => {
		expect(() => assertCredentialEligibility(null, now)).toThrow(
			ForbiddenException,
		);
	});
});
