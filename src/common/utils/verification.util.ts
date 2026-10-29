/**
 * Determine the verification status based on the verification expiration date.
 *
 * @param verifiedUntil verification expiration date
 * @returns verification status: Verified, Expired, or Not Verified
 */
export function getVerificationStatus(
	verifiedUntil: Date | null,
): 'Verified' | 'Expired' | 'Not Verified' {
	if (!verifiedUntil) return 'Not Verified';

	return new Date(verifiedUntil) < new Date() ? 'Expired' : 'Verified';
}
