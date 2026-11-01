import { pythonRound } from './rounding';
describe('Copy/Python exact binary rounding', () => {
	it.each([
		[0.5, 0, 0],
		[1.5, 0, 2],
		[2.5, 0, 2],
		[-0.5, 0, -0],
		[-1.5, 0, -2],
		[2.675, 2, 2.67],
		[2.685, 2, 2.69],
		[1.005, 2, 1],
		[0.125, 2, 0.12],
		[0.375, 2, 0.38],
	])('should round %s to %s digits as %s', (value, digits, expected) => {
		expect(Object.is(pythonRound(value, digits), expected)).toBe(true);
	});
	it('should reject unsupported nonfinite inputs', () => {
		expect(() => pythonRound(Infinity)).toThrow();
	});
});
