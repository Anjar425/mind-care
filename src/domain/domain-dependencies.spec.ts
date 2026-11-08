import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

// Domain folders may depend on each other, but never in a cycle (the former
// rules <-> rule-conflicts cycle is what the split "core"/"storage" modules worked around).
const DOMAIN = join(__dirname);

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
	});
}

function folderGraph(): Map<string, Set<string>> {
	const graph = new Map<string, Set<string>>();
	for (const file of sourceFiles(DOMAIN)) {
		const from = relative(DOMAIN, file).split(sep)[0];
		const edges = graph.get(from) ?? new Set<string>();
		graph.set(from, edges);
		for (const [, spec] of readFileSync(file, 'utf8').matchAll(
			/from '(\.[^']+)'/g,
		)) {
			const target = relative(
				DOMAIN,
				posix.join(dirname(file).split(sep).join('/'), spec),
			).split(/[\\/]/);
			if (target[0] !== '..' && target[0] !== from && target.length > 1)
				edges.add(target[0]);
		}
	}
	return graph;
}

function findCycle(graph: Map<string, Set<string>>): string[] | undefined {
	const state = new Map<string, 'open' | 'done'>();
	const visit = (node: string, path: string[]): string[] | undefined => {
		state.set(node, 'open');
		for (const next of graph.get(node) ?? []) {
			if (state.get(next) === 'open')
				return [...path.slice(path.indexOf(next)), node, next];
			if (!state.has(next)) {
				const cycle = visit(next, [...path, node]);
				if (cycle) return cycle;
			}
		}
		state.set(node, 'done');
		return undefined;
	};
	for (const node of graph.keys())
		if (!state.has(node)) {
			const cycle = visit(node, []);
			if (cycle) return cycle;
		}
	return undefined;
}

describe('Domain folder dependencies', () => {
	it('should form an acyclic graph', () => {
		const graph = folderGraph();
		expect(graph.size).toBeGreaterThanOrEqual(13);
		// Sanity: known edges are discovered, so an empty graph cannot pass silently.
		expect([...(graph.get('rule-conflicts') ?? [])]).toContain('rules');
		expect([...(graph.get('screening') ?? [])]).toContain('qdss');
		expect(findCycle(graph)).toBeUndefined();
	});

	it('should detect a cycle when one is introduced', () => {
		const graph = new Map([
			['rules', new Set(['rule-conflicts'])],
			['rule-conflicts', new Set(['rules'])],
		]);
		expect(findCycle(graph)).toEqual(['rules', 'rule-conflicts', 'rules']);
	});
});
