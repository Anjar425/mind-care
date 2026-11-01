import { Test, TestingModule } from '@nestjs/testing';
import { ExpertPreferencesCompletenessService } from './expert-preferences-completeness.service';
import {
	completePreferenceRows,
	preferenceCatalog,
} from '../../test/expert-preferences-mocks';

describe('ExpertPreferencesCompletenessService', () => {
	let module: TestingModule;
	let service: ExpertPreferencesCompletenessService;
	beforeEach(async () => {
		module = await Test.createTestingModule({
			providers: [ExpertPreferencesCompletenessService],
		}).compile();
		service = module.get(ExpertPreferencesCompletenessService);
	});
	afterEach(async () => {
		await module.close();
		jest.clearAllMocks();
	});
	it('should be defined', () => expect(service).toBeDefined());
	it('should return an unsubmitted empty state without invented vectors', () => {
		const state = service.state('owner', preferenceCatalog(), []);
		expect(state.preferences).toEqual([]);
		expect(state.preferencesComplete).toBe(false);
	});
	it('should require all 21 valid current-release question vectors', () => {
		expect(
			service.state(
				'owner',
				preferenceCatalog(),
				completePreferenceRows(),
			).preferencesComplete,
		).toBe(true);
		expect(
			service.state(
				'owner',
				preferenceCatalog(),
				completePreferenceRows().slice(1),
			).preferencesComplete,
		).toBe(false);
	});
	it('should mark a differently authored release incomplete without relabeling its values', () => {
		const rows = completePreferenceRows('previous-release');
		const state = service.state('owner', preferenceCatalog(), rows);
		expect(state.preferencesComplete).toBe(false);
		expect(state.preferences[0].catalogVersion).toBe('previous-release');
	});
	it('should return catalog order and project only owned preference fields', () => {
		const rows = completePreferenceRows()
			.reverse()
			.map((row) => ({ ...row, expertId: 'private', id: 123 }));
		const state = service.state('owner', preferenceCatalog(), rows);
		expect(state.preferences[0].dass21Id).toBe('DASS21-Q01');
		expect(state.preferences[0]).not.toHaveProperty('expertId');
		expect(state.preferences[0]).not.toHaveProperty('id');
		expect(state).not.toHaveProperty('expertValid');
	});
	it.each(['duplicate', 'unknown', 'badtotal', 'null', 'excess'] as const)(
		'should fail closed on corrupt stored state %s',
		(kind) => {
			const rows = completePreferenceRows();
			if (kind === 'duplicate') rows[1] = { ...rows[0] };
			if (kind === 'unknown') rows[0].dass21Id = 'UNKNOWN';
			if (kind === 'badtotal') rows[0].percentStress = 0;
			if (kind === 'null')
				rows[0].percentStress = null as unknown as number;
			if (kind === 'excess') rows.push({ ...rows[0] });
			expect(() =>
				service.state('owner', preferenceCatalog(), rows),
			).toThrow('requires review');
		},
	);
	it('should reject an invalid catalog instead of treating any 21 rows as complete', () => {
		expect(() =>
			service.state(
				'owner',
				{ ...preferenceCatalog(), questions: [] },
				[],
			),
		).toThrow('unavailable');
	});
});
