import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/generated/client';
import type { StoredQuestion } from './reference-data.types';
import { getReferenceSeedBundle } from './reference-seed.plan';
import {
	ReferenceSeedError,
	type ReferenceSeedBundle,
	type ReferenceSeedReport,
	type SeedConflict,
	type SeedCollectionSummary,
} from './reference-seed.types';

const QUESTION_SELECT = {
	id: true,
	number: true,
	text: true,
	category: true,
	catalogVersion: true,
} as const;

@Injectable()
export class ReferenceSeedService {
	constructor(private readonly prisma: PrismaService) {}

	async run(apply = false): Promise<ReferenceSeedReport> {
		const bundle = getReferenceSeedBundle();
		try {
			return await this.prisma.$transaction(
				async (tx) => {
					if (apply) {
						// Serialize writes to these reference tables, including other writers.
						await tx.$executeRaw`LOCK TABLE "DASS21", "DASS42", "Conclusion" IN SHARE ROW EXCLUSIVE MODE`;
					}
					const state = await this.inspect(tx, bundle);
					if (!apply) return state.report;
					if (!state.report.canApply)
						throw new ReferenceSeedError(
							'CONFLICT',
							'Existing reference data conflicts with the candidate catalog; no changes applied',
							state.report,
						);
					let inserted = 0;
					if (state.dass21.length)
						inserted += (
							await tx.dASS21.createMany({ data: state.dass21 })
						).count;
					if (state.dass42.length)
						inserted += (
							await tx.dASS42.createMany({ data: state.dass42 })
						).count;
					if (state.conclusions.length)
						inserted += (
							await tx.conclusion.createMany({
								data: state.conclusions,
							})
						).count;
					const expected =
						state.dass21.length +
						state.dass42.length +
						state.conclusions.length;
					if (inserted !== expected)
						throw new ReferenceSeedError(
							'WRITE_INCOMPLETE',
							'Reference write counts did not match; transaction rolled back',
						);
					const after = await this.inspect(tx, bundle);
					if (
						!after.report.canApply ||
						after.dass21.length ||
						after.dass42.length ||
						after.conclusions.length
					)
						throw new ReferenceSeedError(
							'WRITE_INCOMPLETE',
							'Reference data verification failed; transaction rolled back',
						);
					return { ...state.report, mode: 'apply', inserted };
				},
				{ isolationLevel: 'Serializable' },
			);
		} catch (error: unknown) {
			if (error instanceof ReferenceSeedError) throw error;
			const code =
				typeof error === 'object' && error !== null && 'code' in error
					? error.code
					: undefined;
			if (code === 'P2034' || code === 'P2002')
				throw new ReferenceSeedError(
					'CONCURRENT_CHANGE',
					'Reference data changed concurrently; run preview again',
				);
			throw new ReferenceSeedError(
				'STORAGE_UNAVAILABLE',
				'Reference storage is unavailable; check database access and apply the reference metadata migration first',
			);
		}
	}

	private async inspect(
		tx: Prisma.TransactionClient,
		bundle: ReferenceSeedBundle,
	) {
		const [rows21, rows42, conclusions] = await Promise.all([
			tx.dASS21.findMany({
				select: QUESTION_SELECT,
				take: bundle.dass21.length + 1,
			}),
			tx.dASS42.findMany({
				select: QUESTION_SELECT,
				take: bundle.dass42.length + 1,
			}),
			tx.conclusion.findMany({
				select: { id: true, category: true, severty: true },
				take: bundle.conclusions.length + 1,
			}),
		]);
		const conflicts: SeedConflict[] = [];
		const compareQuestions = (
			collection: 'DASS21' | 'DASS42',
			expected: StoredQuestion[],
			existing: StoredQuestion[],
		) => {
			const known = new Set(expected.map((row) => row.id));
			if (existing.some((row) => !known.has(row.id)))
				conflicts.push({ collection, reason: 'UNEXPECTED_ROWS' });
			const stored = new Map(existing.map((row) => [row.id, row]));
			if (stored.size !== existing.length)
				conflicts.push({ collection, reason: 'DUPLICATE_IDENTITY' });
			const missing: StoredQuestion[] = [];
			let unchanged = 0;
			for (const row of expected) {
				const found = stored.get(row.id);
				if (!found) {
					missing.push(row);
					continue;
				}
				if (
					found.number !== row.number ||
					found.text !== row.text ||
					found.category !== row.category ||
					found.catalogVersion !== row.catalogVersion
				)
					conflicts.push({
						collection,
						reason: 'CONTENT_MISMATCH',
						questionId: row.id,
					});
				else unchanged++;
			}
			const summary: SeedCollectionSummary = {
				expected: expected.length,
				insert: missing.length,
				unchanged,
			};
			return { missing, summary };
		};
		const plan21 = compareQuestions('DASS21', bundle.dass21, rows21);
		const plan42 = compareQuestions('DASS42', bundle.dass42, rows42);
		const pairKey = (row: { category: string; severty: string }) =>
			`${row.category}:${row.severty}`;
		const expectedPairs = new Set(bundle.conclusions.map(pairKey));
		const storedPairs = new Set(conclusions.map(pairKey));
		if (conclusions.some((row) => !expectedPairs.has(pairKey(row))))
			conflicts.push({
				collection: 'Conclusion',
				reason: 'UNEXPECTED_ROWS',
			});
		if (storedPairs.size !== conclusions.length)
			conflicts.push({
				collection: 'Conclusion',
				reason: 'DUPLICATE_IDENTITY',
			});
		const missingConclusions = bundle.conclusions.filter(
			(row) => !storedPairs.has(pairKey(row)),
		);
		const report: ReferenceSeedReport = {
			mode: 'preview',
			catalogVersion: bundle.catalogVersion,
			catalogDigest: bundle.catalogDigest,
			canApply: conflicts.length === 0,
			collections: {
				DASS21: plan21.summary,
				DASS42: plan42.summary,
				Conclusion: {
					expected: bundle.conclusions.length,
					insert: missingConclusions.length,
					unchanged:
						bundle.conclusions.length - missingConclusions.length,
				},
			},
			conflicts,
			inserted: 0,
		};
		return {
			report,
			dass21: plan21.missing,
			dass42: plan42.missing,
			conclusions: missingConclusions,
		};
	}
}
