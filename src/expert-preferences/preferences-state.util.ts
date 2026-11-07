import { createHash } from 'node:crypto';
import type { StoredPreferenceVector } from './expert-preferences.types';

// Comparison metadata only. Authorization is independently enforced by the caller.
export function preferencesStateHash(
	ownerId: string,
	catalogVersion: string,
	rows: readonly StoredPreferenceVector[],
): string {
	const ordered = [...rows]
		.sort((a, b) => a.dass21Id.localeCompare(b.dass21Id))
		.map((row) => [
			row.dass21Id,
			row.catalogVersion,
			row.percentDepression,
			row.percentAnxiety,
			row.percentStress,
		]);
	return createHash('sha256')
		.update(
			JSON.stringify([
				'mindcare/preferences-state/v1',
				ownerId,
				catalogVersion,
				ordered,
			]),
		)
		.digest('hex');
}
