import { assertPreferencesSubmission } from './preferences.validation';
import { validPreferencesSubmission } from '../../test/expert-preferences-mocks';

describe('Complete DASS21 preference validation', () => {
	it('should accept all 21 independent totals of 100 without changing expert input', () => {
		const dto = validPreferencesSubmission();
		const original = structuredClone(dto);
		expect(() => assertPreferencesSubmission(dto)).not.toThrow();
		expect(dto).toEqual(original);
	});
	it.each(['percentDepression', 'percentAnxiety', 'percentStress'] as const)(
		'should accept individual zero and 100 boundaries for %s',
		(key) => {
			const dto = validPreferencesSubmission();
			for (const row of dto.preferences) {
				row.percentDepression = 0;
				row.percentAnxiety = 0;
				row.percentStress = 0;
				row[key] = 100;
			}
			expect(() => assertPreferencesSubmission(dto)).not.toThrow();
		},
	);
	it.each([0, 20, 22, 10000])(
		'should reject group count %s before accepting partial state',
		(count) => {
			const dto = validPreferencesSubmission();
			const preferences = Array.from(
				{ length: count },
				(_, i) => dto.preferences[i % 21],
			);
			expect(() =>
				assertPreferencesSubmission({ ...dto, preferences }),
			).toThrow();
		},
	);
	it.each(['percentDepression', 'percentAnxiety', 'percentStress'] as const)(
		'should reject unsupported %s values without correction',
		(key) => {
			for (const value of [
				-1,
				101,
				1.5,
				NaN,
				Infinity,
				'40',
				null,
				undefined,
				true,
			]) {
				const dto = validPreferencesSubmission();
				const preferences = dto.preferences.map((row, i) =>
					i === 0 ? { ...row, [key]: value } : row,
				);
				expect(() =>
					assertPreferencesSubmission({ ...dto, preferences }),
				).toThrow();
			}
		},
	);
	it.each([0, 99, 101])(
		'should reject an individual group total %s without rescaling the set',
		(total) => {
			const dto = validPreferencesSubmission();
			dto.preferences[0] = {
				...dto.preferences[0],
				percentDepression: total > 100 ? 100 : total,
				percentAnxiety: total > 100 ? 1 : 0,
				percentStress: 0,
			};
			const before = structuredClone(dto);
			expect(() => assertPreferencesSubmission(dto)).toThrow();
			expect(dto).toEqual(before);
		},
	);
	it('should reject a duplicate question even when 21 objects are present', () => {
		const dto = validPreferencesSubmission();
		dto.preferences[20] = { ...dto.preferences[0] };
		expect(() => assertPreferencesSubmission(dto)).toThrow();
	});
	it.each(['UNKNOWN', 'DASS42-Q01', 'DASS21-Q22', 1, null])(
		'should reject foreign or unrecognized question identity %p',
		(dass21Id) => {
			const dto = validPreferencesSubmission();
			const preferences = [
				{ ...dto.preferences[0], dass21Id },
				...dto.preferences.slice(1),
			];
			expect(() =>
				assertPreferencesSubmission({ ...dto, preferences }),
			).toThrow();
		},
	);
	it('should accept unordered keyed input without rewriting it into catalog order', () => {
		const dto = validPreferencesSubmission();
		dto.preferences.reverse();
		const original = structuredClone(dto);
		expect(() => assertPreferencesSubmission(dto)).not.toThrow();
		expect(dto).toEqual(original);
	});
	it('should reject owner/approval injection at root and row levels', () => {
		const dto = validPreferencesSubmission();
		expect(() =>
			assertPreferencesSubmission({ ...dto, expertId: 'other' }),
		).toThrow();
		expect(() =>
			assertPreferencesSubmission({
				...dto,
				preferences: dto.preferences.map((row, i) =>
					i === 0 ? { ...row, approved: true } : row,
				),
			}),
		).toThrow();
	});
	it.each([{}, null, [], { preferences: null }])(
		'should reject incomplete root state %p',
		(value) => {
			expect(() => assertPreferencesSubmission(value)).toThrow();
		},
	);
	it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), null])(
		'should reject unsupported comparison metadata %p',
		(expectedStateHash) => {
			expect(() =>
				assertPreferencesSubmission({
					...validPreferencesSubmission(),
					expectedStateHash,
				}),
			).toThrow();
		},
	);
	it.each(['', ' version ', 'x'.repeat(65), null])(
		'should reject malformed authored release %p',
		(catalogVersion) => {
			expect(() =>
				assertPreferencesSubmission({
					...validPreferencesSubmission(),
					catalogVersion,
				}),
			).toThrow();
		},
	);
	it('should allow a well-formed different release to reach the service conflict check', () => {
		expect(() =>
			assertPreferencesSubmission({
				...validPreferencesSubmission(),
				catalogVersion: 'previous-release',
			}),
		).not.toThrow();
	});
});
