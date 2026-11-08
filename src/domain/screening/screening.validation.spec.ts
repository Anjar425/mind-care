import { identifiedScreening } from './screening.validation';
import {
	publicDass42Input,
	publicQdssInput,
} from '../../../test/screening-mocks';
describe('Identified stateless screening input', () => {
	it('should preserve unique integer21 and fractional42 answers in independent snapshots', () => {
		const q = publicQdssInput();
		const d = publicDass42Input();
		expect(identifiedScreening(q, 'QDSS_DASS21')).toEqual(q);
		const accepted = identifiedScreening(d, 'DASS42_MAMDANI');
		d.answers[0].score = 3;
		expect(accepted.answers[0].score).toBe(1.5);
	});
	it.each([
		{ scope: 'GROUP' },
		{ scope: 'GLOBAL', groupId: 1 },
		{ scope: 'unknown' },
		{ scope: 'GROUP', groupId: 0 },
		{ scope: 'GROUP', groupId: '1' },
		{ scope: 'GROUP', groupId: 2147483648 },
		{ catalogVersion: '' },
		{ extra: 'sensitive' },
	])('should reject inconsistent QDSS scope or root fields%j', (change) => {
		expect(() =>
			identifiedScreening(
				{ ...publicQdssInput(), ...change },
				'QDSS_DASS21',
			),
		).toThrow('Invalid screening request');
	});
	it.each([
		'missing',
		'duplicate',
		'string',
		'float',
		'infinite',
		'negative',
		'above',
		'unknown-field',
	])('should reject invalid21 answers:%s', (kind) => {
		const input = publicQdssInput();
		if (kind === 'missing') input.answers.pop();
		if (kind === 'duplicate')
			input.answers[1].dass21Id = input.answers[0].dass21Id;
		if (kind === 'string') Object.assign(input.answers[0], { score: '1' });
		if (kind === 'float') input.answers[0].score = 1.5;
		if (kind === 'infinite') input.answers[0].score = Infinity;
		if (kind === 'negative') input.answers[0].score = -1;
		if (kind === 'above') input.answers[0].score = 4;
		if (kind === 'unknown-field')
			Object.assign(input.answers[0], { private: 'not echoed' });
		expect(() => identifiedScreening(input, 'QDSS_DASS21')).toThrow(
			'Invalid screening request',
		);
	});
	it.each([0, 0.1, 1.5, 2.75, 3])(
		'should retain a valid DASS42 score%s without rounding',
		(score) => {
			const input = publicDass42Input();
			input.answers[0].score = score;
			expect(
				identifiedScreening(input, 'DASS42_MAMDANI').answers[0].score,
			).toBe(score);
		},
	);
	it.each([
		null,
		{},
		[],
		{ ...publicDass42Input(), scope: 'GLOBAL' },
		{ ...publicDass42Input(), groupId: null },
	])('should reject missing or unrecognized DASS42 fields%j', (input) => {
		expect(() => identifiedScreening(input, 'DASS42_MAMDANI')).toThrow();
	});
});
