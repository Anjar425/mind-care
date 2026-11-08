import { PositiveIntIdPipe } from './positive-int-id.pipe';
describe('Rule path identifiers', () => {
	it.each([
		'0',
		'-1',
		'1.5',
		'1e2',
		'0x10',
		'NaN',
		'Infinity',
		'2147483648',
		'9007199254740993',
		'',
	])('should reject unsafe/nonpositive identifier %s', (value) =>
		expect(() => new PositiveIntIdPipe().transform(value)).toThrow(),
	);
	it('should accept the positive PostgreSQL integer boundaries', () => {
		const pipe = new PositiveIntIdPipe();
		expect(pipe.transform('1')).toBe(1);
		expect(pipe.transform('2147483647')).toBe(2147483647);
	});
});
