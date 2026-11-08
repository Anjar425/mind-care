import { randomBytes } from 'node:crypto';
import type { QdssOutput, Triple } from '../qdss.types';
import { pythonRound } from './rounding';
export interface RandomSource {
	uniform(): number;
	normal(): number;
}
export class SystemRandom implements RandomSource {
	uniform() {
		return randomBytes(6).readUIntBE(0, 6) / 281474976710656;
	}
	normal() {
		let u = this.uniform();
		while (u === 0) u = this.uniform();
		return (
			Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.uniform())
		);
	}
}
const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
const normalize = (a: number[]) => {
	const total = sum(a);
	if (!(total > 0) || !Number.isFinite(total))
		throw new Error('Invalid GA weight sum');
	return a.map((v) => v / total);
};
const variance = (a: number[]) => {
	const mean = sum(a) / a.length;
	return sum(a.map((v) => (v - mean) ** 2)) / a.length;
};
export function aggregate(
	preferences: readonly Triple[][],
	weights: readonly number[],
): Triple[] {
	const order = weights
		.map((_, i) => i)
		.sort((a, b) => weights[b] - weights[a] || b - a);
	return Array.from(
		{ length: 21 },
		(_, q) =>
			[0, 1, 2].map((k) =>
				Math.min(
					1,
					Math.max(
						0,
						sum(
							order.map(
								(e) =>
									weights[e] * (preferences[e][q][k] / 100),
							),
						),
					),
				),
			) as Triple,
	);
}
export function fitness(
	preferences: Triple[][],
	weights: number[],
	samples: number[][],
): { score: number; matrix: Triple[] } {
	const w = normalize(weights);
	const matrix = aggregate(preferences, w).map((row) => {
		const total = sum(row);
		return (total > 1e-9 ? row.map((v) => v / total) : [0, 0, 0]) as Triple;
	});
	const qgdd = [0, 1, 2]
		.map((k) => {
			const v = variance(matrix.map((row) => row[k]));
			return v <= 1 ? 1 - v : 0;
		})
		.sort((a, b) => b - a);
	const positive = w.filter((v) => v > 0);
	const fairness =
		positive.length > 1
			? -sum(positive.map((v) => v * Math.log(v))) /
				Math.log(positive.length)
			: 0;
	const counts = [0, 0, 0];
	for (const sample of samples) {
		const totals = [0, 1, 2].map((k) =>
			sum(matrix.map((row, q) => sample[q] * row[k])),
		);
		const total = sum(totals);
		const integrated =
			total > 0 ? totals.map((v) => v / total) : [1 / 3, 1 / 3, 1 / 3];
		let winner = 0;
		for (let k = 1; k < 3; k++)
			if (integrated[k] > integrated[winner]) winner = k;
		counts[winner]++;
	}
	const penalty =
		samples.length > 1
			? Math.sqrt(variance(counts)) / (samples.length / 1.5)
			: 0;
	return {
		score: 0.75 * (qgdd[0] - qgdd[1]) + 0.25 * fairness - 0.8 * penalty,
		matrix,
	};
}
export function consensusForWeights(
	preferences: Triple[][],
	weights: number[],
	group: boolean,
): Triple[] {
	if (group) {
		const influence = weights.map((w) => w * 100);
		const ratios = influence.map((w) => w / sum(influence));
		return aggregate(preferences, ratios).map(
			(row) => row.map((v) => pythonRound(v * 100, 2) / 100) as Triple,
		);
	}
	return aggregate(preferences, normalize(weights)).map((row) => {
		const total = sum(row);
		return (total > 1e-9 ? row.map((v) => v / total) : [0, 0, 0]) as Triple;
	});
}
export async function optimize(
	preferences: Triple[][],
	samples: number[][],
	group: boolean,
	rng: RandomSource = new SystemRandom(),
): Promise<QdssOutput> {
	const n = preferences.length;
	if (n < 4 || n > 100 || samples.length < 20)
		throw new Error('Unsupported QDSS dimensions');
	const randomIndex = (size: number) =>
		Math.min(size - 1, Math.floor(rng.uniform() * size));
	let population = Array.from({ length: 20 }, () =>
		normalize(Array.from({ length: n }, () => rng.uniform())),
	);
	const deadline = Date.now() + 15000;
	for (let generation = 0; generation < 50; generation++) {
		await new Promise<void>((resolve) => setImmediate(resolve));
		if (Date.now() > deadline) throw new Error('GA execution time limit');
		const scores = population.map(
			(w) => fitness(preferences, w, samples).score,
		);
		const selected = population
			.map((_, i) => i)
			.sort((a, b) => scores[b] - scores[a] || b - a)
			.slice(0, 10)
			.map((i) => population[i]);
		const next = selected.slice();
		while (next.length < 20) {
			const first = randomIndex(selected.length);
			let second = randomIndex(selected.length - 1);
			if (second >= first) second++;
			const cross = 1 + randomIndex(n - 1);
			let child = normalize([
				...selected[first].slice(0, cross),
				...selected[second].slice(cross),
			]);
			if (rng.uniform() < 0.1) {
				child[randomIndex(n)] += rng.normal() * 0.1;
				child = normalize(
					child.map((v) => Math.min(1, Math.max(0, v))),
				);
			}
			next.push(child);
		}
		population = next;
	}
	const weights = normalize(
		population[0].map((v) => Math.max(v, n * 0.01 >= 1 ? 1e-6 : 0.01)),
	);
	const consensus = consensusForWeights(preferences, weights, group);
	return { weights, consensus };
}
