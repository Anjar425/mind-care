import { preferencesStateHash } from './preferences-state.util';
import { completePreferenceRows } from '../../test/expert-preferences-mocks';

describe('Preference state hash', () => {
	it('should return stable owner-bound SHA-256 metadata for an empty state', () => {
		expect(preferencesStateHash('owner', 'v1', [])).toMatch(
			/^[a-f0-9]{64}$/,
		);
		expect(preferencesStateHash('owner', 'v1', [])).not.toBe(
			preferencesStateHash('other', 'v1', []),
		);
	});
	it('should compare values independently of database row order', () => {
		const rows = completePreferenceRows();
		const original = structuredClone(rows);
		expect(preferencesStateHash('owner', 'v1', rows)).toBe(
			preferencesStateHash('owner', 'v1', [...rows].reverse()),
		);
		expect(rows).toEqual(original);
	});
	it('should change when a submitted vector changes while its total remains valid', () => {
		const rows = completePreferenceRows();
		const changed = structuredClone(rows);
		changed[0].percentDepression++;
		changed[0].percentStress--;
		expect(preferencesStateHash('owner', 'v1', rows)).not.toBe(
			preferencesStateHash('owner', 'v1', changed),
		);
	});
	it('should bind both current release and authored release to comparison state', () => {
		const rows = completePreferenceRows();
		expect(preferencesStateHash('owner', 'v1', rows)).not.toBe(
			preferencesStateHash('owner', 'v2', rows),
		);
		const changed = structuredClone(rows);
		changed[0].catalogVersion = 'other';
		expect(preferencesStateHash('owner', 'v1', rows)).not.toBe(
			preferencesStateHash('owner', 'v1', changed),
		);
	});
	it('should project relevant fields instead of leaking private persistence metadata into the digest contract', () => {
		const rows = completePreferenceRows();
		const extra = rows.map((row) => ({ ...row, privateData: 'synthetic' }));
		expect(preferencesStateHash('owner', 'v1', rows)).toBe(
			preferencesStateHash('owner', 'v1', extra),
		);
	});
});
