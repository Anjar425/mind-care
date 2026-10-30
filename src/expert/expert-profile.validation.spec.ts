import { assertExpertProfileSubmission } from './expert-profile.validation';
import { validProfileSubmission } from '../../test/expert-profile-mocks';
describe('Expert profile contract', () => {
	it('should accept complete zero counts and hours while preserving original weights', () => {
		const dto = validProfileSubmission();
		const before = structuredClone(dto);
		expect(() => assertExpertProfileSubmission(dto)).not.toThrow();
		expect(dto).toEqual(before);
	});
	it('should accept a zero individual factor when the exact total remains 100', () => {
		const dto = validProfileSubmission();
		dto.weights = {
			educationWeight: 0,
			publicationWeight: 100,
			patientWeight: 0,
			clinicalHoursWeight: 0,
		};
		expect(() => assertExpertProfileSubmission(dto)).not.toThrow();
	});
	it.each([99, 101, 0])(
		'should reject total %s without rescaling',
		(total) => {
			const dto = validProfileSubmission();
			dto.weights = {
				educationWeight: total > 100 ? 100 : total,
				publicationWeight: total > 100 ? 1 : 0,
				patientWeight: 0,
				clinicalHoursWeight: 0,
			};
			const before = structuredClone(dto);
			expect(() => assertExpertProfileSubmission(dto)).toThrow(
				'Bad Request',
			);
			expect(dto).toEqual(before);
		},
	);
	it.each([
		'educationWeight',
		'publicationWeight',
		'patientWeight',
		'clinicalHoursWeight',
	] as const)('should reject invalid %s percentages independently', (key) => {
		for (const value of [
			-1,
			101,
			25.5,
			NaN,
			Infinity,
			undefined,
			null,
			'25',
		]) {
			const dto = validProfileSubmission();
			const input = { ...dto, weights: { ...dto.weights, [key]: value } };
			expect(() => assertExpertProfileSubmission(input)).toThrow();
		}
	});
	it.each(['publicationsNumber', 'patientsNumber', 'clinicalHours'] as const)(
		'should reject invalid %s counts instead of rounding or coercing',
		(key) => {
			for (const value of [
				-1,
				0.5,
				2147483648,
				Number.MAX_SAFE_INTEGER,
				NaN,
				Infinity,
				'0',
				null,
				undefined,
			])
				expect(() =>
					assertExpertProfileSubmission({
						...validProfileSubmission(),
						profile: {
							...validProfileSubmission().profile,
							[key]: value,
						},
					}),
				).toThrow();
		},
	);
	it.each(['BACHELOR', 'MASTER', 'DOCTOR'])(
		'should accept supported education %s without numeric scoring',
		(education) => {
			const dto = validProfileSubmission();
			expect(() =>
				assertExpertProfileSubmission({
					...dto,
					profile: { ...dto.profile, education },
				}),
			).not.toThrow();
		},
	);
	it.each([0, 'S1', 'UNKNOWN', null, undefined, ''])(
		'should reject unsupported education %p instead of assigning a default',
		(education) => {
			const dto = validProfileSubmission();
			expect(() =>
				assertExpertProfileSubmission({
					...dto,
					profile: { ...dto.profile, education },
				}),
			).toThrow();
		},
	);
	it.each([{}, null, [], { profile: null }, { weights: null }])(
		'should reject incomplete root or nested objects %p',
		(value) => {
			expect(() => assertExpertProfileSubmission(value)).toThrow();
		},
	);
	it('should reject owner identity, unsupported profile fields and extra factors', () => {
		const dto = validProfileSubmission();
		expect(() =>
			assertExpertProfileSubmission({ ...dto, expertId: 'other' }),
		).toThrow();
		expect(() =>
			assertExpertProfileSubmission({
				...dto,
				profile: { ...dto.profile, unsupportedMetric: 5 },
			}),
		).toThrow();
		expect(() =>
			assertExpertProfileSubmission({
				...dto,
				weights: { ...dto.weights, extraFactor: 25 },
			}),
		).toThrow();
	});
	it.each([-1, 0.5, '0', 2147483647, undefined])(
		'should reject invalid profile concurrency version %p',
		(expectedVersion) => {
			expect(() =>
				assertExpertProfileSubmission({
					...validProfileSubmission(),
					expectedVersion,
				}),
			).toThrow();
		},
	);
	it('should accept the full PostgreSQL integer range without inventing a domain cap', () => {
		const dto = validProfileSubmission();
		dto.profile.clinicalHours = 2147483647;
		expect(() => assertExpertProfileSubmission(dto)).not.toThrow();
	});
});
