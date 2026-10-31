import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { storedPreferencesValid } from './preferences.validation';
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
		if (!storedPreferencesValid(catalog, rows))
			throw new ServiceUnavailableException(
				'Stored preference set requires review',
			);
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
