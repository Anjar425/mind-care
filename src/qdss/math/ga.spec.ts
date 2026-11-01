import { optimize, fitness, aggregate, type RandomSource } from './ga';
import type { Triple } from '../qdss.types';
const preferences = () =>
	Array.from({ length: 4 }, () =>
		Array.from({ length: 21 }, () => [20, 70, 10] as Triple),
	);
const samples = () =>
	Array.from({ length: 20 }, () => Array(21).fill(1) as number[]);
describe('Selected Copy GA mathematical contract', () => {
	it('should preserve direct preference percentages rather than triangular defuzzification', () => {
		const matrix = aggregate(preferences(), [0.25, 0.25, 0.25, 0.25]);
		expect(matrix[0]).toEqual([0.2, 0.7, 0.1]);
	});
	it('should preserve paired weights when contributor order changes', () => {
		const p = preferences();
		p[0] = Array.from({ length: 21 }, () => [100, 0, 0]);
		expect(aggregate(p, [0.4, 0.3, 0.2, 0.1])).toEqual(
			aggregate(p.slice().reverse(), [0.1, 0.2, 0.3, 0.4]),
		);
	});
	it('should implement population distribution penalty over arbitrary complete sample counts', () => {
		const f = fitness(preferences(), [0.25, 0.25, 0.25, 0.25], samples());
		const expected =
			0.25 -
			(0.8 *
				Math.sqrt(
					((-20 / 3) ** 2 + (40 / 3) ** 2 + (-20 / 3) ** 2) / 3,
				)) /
				(20 / 1.5);
		expect(f.score).toBeCloseTo(expected, 12);
		expect(
			fitness(
				preferences(),
				[0.25, 0.25, 0.25, 0.25],
				[...samples(), ...samples()],
			).score,
		).toBeCloseTo(f.score, 12);
	});
	it('should run all 50 generations with deterministic test draws and preserve symmetric consensus', async () => {
		let draws = 0;
		const rng: RandomSource = {
			uniform: () => {
				draws++;
				return 0.5;
			},
			normal: () => 0,
		};
		const out = await optimize(preferences(), samples(), true, rng);
		expect(out.weights).toEqual([0.25, 0.25, 0.25, 0.25]);
		expect(out.consensus[0]).toEqual([0.2, 0.7, 0.1]);
		expect(draws).toBe(2080);
	});
	it('should reject unsupported dimensions rather than invent experts', async () => {
		await expect(
			optimize(preferences().slice(0, 3), samples(), true),
		).rejects.toThrow();
	});
});
