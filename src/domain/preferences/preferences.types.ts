export interface PreferenceVector {
	dass21Id: string;
	percentDepression: number;
	percentAnxiety: number;
	percentStress: number;
}
export interface StoredPreferenceVector extends PreferenceVector {
	catalogVersion: string;
}
export interface PreferenceCatalog {
	catalogVersion: string;
	questions: readonly { id: string; number: number }[];
}
export interface ReplacePreferences {
	catalogVersion: string;
	expectedStateHash: string;
	preferences: PreferenceVector[];
}
export interface PreferenceState {
	instrument: 'DASS21';
	catalogVersion: string;
	stateHash: string;
	preferencesComplete: boolean;
	preferences: StoredPreferenceVector[];
}
