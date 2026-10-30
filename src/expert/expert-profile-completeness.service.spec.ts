import { Test, TestingModule } from '@nestjs/testing';
import { ExpertProfileCompletenessService } from './expert-profile-completeness.service';
import {
	createExpertProfileMocks,
	validProfileSubmission,
} from '../../test/expert-profile-mocks';
describe('ExpertProfileCompletenessService', () => {
	let module: TestingModule;
	let service: ExpertProfileCompletenessService;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [ExpertProfileCompletenessService],
		}).compile();
		service = module.get(ExpertProfileCompletenessService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	const complete = () => ({
		...createExpertProfileMocks().expert,
		...validProfileSubmission().profile,
		weight: validProfileSubmission().weights,
		profileVersion: 1,
		profileValidatedAt: new Date(),
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should report absent profiles without inventing zero data or creating an expert', () => {
		expect(service.response(null)).toEqual({
			version: 0,
			validatedAt: null,
			profile: null,
			weights: null,
			profileComplete: false,
			weightsComplete: false,
		});
	});
	it('should treat legacy records as incomplete even when existing values happen to fit', () => {
		const row = complete();
		row.profileValidatedAt = null as unknown as Date;
		expect(service.evaluate(row)).toEqual({
			profileComplete: false,
			weightsComplete: false,
		});
	});
	it('should distinguish an explicitly submitted zero from missing clinical hours', () => {
		expect(service.evaluate(complete())).toEqual({
			profileComplete: true,
			weightsComplete: true,
		});
		expect(
			service.evaluate({ ...complete(), clinicalHours: null })
				.profileComplete,
		).toBe(false);
	});
	it('should reject a missing clinical-hours factor without reading legacy experience weight', () => {
		const row = complete();
		expect(
			service.evaluate({
				...row,
				weight: { ...row.weight, clinicalHoursWeight: null },
			}).weightsComplete,
		).toBe(false);
	});
	it('should reject corrupted totals even with a historical validation marker', () => {
		const row = complete();
		row.weight.educationWeight = 26;
		expect(service.evaluate(row).weightsComplete).toBe(false);
	});
	it('should expose only the four profile and weight fields without credential metadata', () => {
		const row = complete();
		const result = service.response({
			...row,
			weight: { ...row.weight, expertId: 'private-owner' },
		} as typeof row);
		expect(Object.keys(result.weights!)).toEqual([
			'educationWeight',
			'publicationWeight',
			'patientWeight',
			'clinicalHoursWeight',
		]);
		expect(result).not.toHaveProperty('credentialEligible');
		expect(result).not.toHaveProperty('expertValid');
	});
});
