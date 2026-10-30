import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
	CATALOG_VERSION_PATTERN,
	preferenceQuestionIds,
	preferenceVectorIssues,
} from './preferences.validation';
import { preferencesStateHash } from './preferences-state.util';
import type {
	PreferenceCatalog,
	PreferenceState,
	StoredPreferenceVector,
} from './expert-preferences.types';

@Injectable()
export class ExpertPreferencesCompletenessService {
	state(
		ownerId: string,
		catalog: PreferenceCatalog,
		rows: readonly StoredPreferenceVector[],
	): PreferenceState {
		const ids = preferenceQuestionIds(catalog);
		const seen = new Set<string>();
		if (rows.length > 21)
			throw new ServiceUnavailableException(
				'Stored preference set requires review',
			);
		for (const row of rows) {
			if (
				preferenceVectorIssues(row, ids, 'Stored preference').length ||
				seen.has(row.dass21Id) ||
				typeof row.catalogVersion !== 'string' ||
				!CATALOG_VERSION_PATTERN.test(row.catalogVersion)
			)
				throw new ServiceUnavailableException(
					'Stored preference set requires review',
				);
			seen.add(row.dass21Id);
		}
		const byId = new Map(rows.map((row) => [row.dass21Id, row]));
		const preferences = catalog.questions
			.map((q) => byId.get(q.id))
			.filter((row): row is StoredPreferenceVector => row !== undefined)
			.map((row) => ({
				dass21Id: row.dass21Id,
				catalogVersion: row.catalogVersion,
				percentDepression: row.percentDepression,
				percentAnxiety: row.percentAnxiety,
				percentStress: row.percentStress,
			}));
		return {
			instrument: 'DASS21',
			catalogVersion: catalog.catalogVersion,
			stateHash: preferencesStateHash(
				ownerId,
				catalog.catalogVersion,
				preferences,
			),
			preferencesComplete:
				preferences.length === 21 &&
				preferences.every(
					(row) => row.catalogVersion === catalog.catalogVersion,
				),
			preferences,
		};
	}
}
