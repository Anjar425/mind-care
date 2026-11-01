import { randomUUID } from 'node:crypto';
import type { Prisma, Rule, RuleAudit } from '../src/prisma/generated/client';
import { PrismaService } from '../src/prisma/prisma.service';
import type { StoredRuleRevision } from '../src/rules/rules.service';
import type { RuleContent } from '../src/rules/rules.types';
import {
	REFERENCE_CONCLUSIONS,
	CATALOG_VERSION,
} from '../src/reference-data/catalogs/reference-metadata';
import { createGroupsMocks } from './groups-mocks';
import { storedQuestions } from './reference-data-mocks';

export function validRuleContent(): RuleContent {
	return {
		catalogVersion: CATALOG_VERSION,
		premises: [
			{
				dass42Id: 'DASS42-Q01',
				prefix: 'NO_PREFIX',
				level: 'LOW',
				joinToNext: 'OR',
			},
			{
				dass42Id: 'DASS42-Q17',
				prefix: 'NOT',
				level: 'MEDIUM',
				joinToNext: 'AND',
			},
			{
				dass42Id: 'DASS42-Q38',
				prefix: 'NO_PREFIX',
				level: 'HIGH',
				joinToNext: 'THEN',
			},
		],
		conclusion: { category: 'DEPRESSION', severity: 'MODERATE' },
	};
}
export function createRulesMocks() {
	const groups = createGroupsMocks();
	const state: {
		rules: Rule[];
		revisions: StoredRuleRevision[];
		audits: RuleAudit[];
		nextId: number;
		conclusions: { id: number; category: string; severty: string }[];
	} = {
		rules: [],
		revisions: [],
		audits: [],
		nextId: 1,
		conclusions: REFERENCE_CONCLUSIONS.map((c, i) => ({
			id: i + 1,
			category: c.category,
			severty: c.severity,
		})),
	};
	const snapshot = (rule: Rule) =>
		structuredClone({
			...rule,
			author: {
				user: {
					name: groups.state.experts.find(
						(e) => e.id === rule.authorExpertId,
					)!.user.name,
				},
			},
			revisions: state.revisions
				.filter((r) => r.ruleId === rule.id)
				.sort((a, b) => b.version - a.version)
				.slice(0, 1),
		});
	const tx = {
		...groups.tx,
		groupMembership: {
			...groups.tx.groupMembership,
			findUnique: jest.fn(
				({
					where,
				}: {
					where: {
						groupId_expertId: { groupId: number; expertId: string };
					};
				}) =>
					Promise.resolve(
						structuredClone(
							groups.state.memberships.find(
								(m) =>
									m.groupId ===
										where.groupId_expertId.groupId &&
									m.expertId ===
										where.groupId_expertId.expertId,
							) ?? null,
						),
					),
			),
		},
		dASS42: {
			findMany: jest.fn(() => Promise.resolve(storedQuestions('DASS42'))),
		},
		conclusion: {
			findUnique: jest.fn(
				({
					where,
				}: {
					where: {
						category_severty: { category: string; severty: string };
					};
				}) =>
					Promise.resolve(
						structuredClone(
							state.conclusions.find(
								(c) =>
									c.category ===
										where.category_severty.category &&
									c.severty ===
										where.category_severty.severty,
							) ?? null,
						),
					),
			),
		},
		rule: {
			create: jest.fn(
				({ data }: { data: Omit<Rule, 'id' | 'archivedAt'> }) => {
					const row: Rule = {
						...data,
						id: state.nextId++,
						archivedAt: null,
					};
					state.rules.push(row);
					return Promise.resolve(structuredClone(row));
				},
			),
			findUnique: jest.fn(
				({ where }: { where: { id: number; groupId: number } }) => {
					const row = state.rules.find(
						(r) => r.id === where.id && r.groupId === where.groupId,
					);
					return Promise.resolve(row ? snapshot(row) : null);
				},
			),
			findMany: jest.fn(
				({
					where,
					skip = 0,
					take,
				}: {
					where: {
						groupId?: number;
						authorExpertId?: string;
						archivedAt?: null | { not: null };
					};
					skip?: number;
					take: number;
				}) =>
					Promise.resolve(
						state.rules
							.filter(
								(r) =>
									(where.groupId === undefined ||
										r.groupId === where.groupId) &&
									(!where.authorExpertId ||
										r.authorExpertId ===
											where.authorExpertId) &&
									(where.archivedAt === undefined ||
										(where.archivedAt === null
											? r.archivedAt === null
											: r.archivedAt !== null)),
							)
							.sort(
								(a, b) =>
									b.updatedAt.getTime() -
										a.updatedAt.getTime() || a.id - b.id,
							)
							.slice(skip, skip + take)
							.map(snapshot),
					),
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: number };
					data: Partial<Rule>;
				}) => {
					const row = state.rules.find((r) => r.id === where.id)!;
					Object.assign(row, data);
					return Promise.resolve(structuredClone(row));
				},
			),
		},
		ruleRevision: {
			create: jest.fn(
				({
					data,
				}: {
					data: {
						ruleId: number;
						version: number;
						catalogVersion: string;
						grammarVersion: string;
						canonicalVersion: string;
						originalPayload: Prisma.InputJsonValue;
						canonicalAntecedent: Prisma.InputJsonValue;
						antecedentHash: string;
						conclusionId: number;
						createdAt: Date;
						premises: { create: StoredRuleRevision['premises'] };
					};
				}) => {
					if (
						state.revisions.some(
							(r) =>
								r.ruleId === data.ruleId &&
								r.version === data.version,
						)
					)
						throw Object.assign(
							new Error('Synthetic version conflict'),
							{ code: 'P2002' },
						);
					const conclusion = state.conclusions.find(
						(c) => c.id === data.conclusionId,
					)!;
					const row = {
						...data,
						id: randomUUID(),
						originalPayload:
							data.originalPayload as Prisma.JsonValue,
						canonicalAntecedent:
							data.canonicalAntecedent as Prisma.JsonValue,
						conclusion: {
							category: conclusion.category,
							severty: conclusion.severty,
						},
						premises: data.premises.create,
					} as StoredRuleRevision;
					state.revisions.push(structuredClone(row));
					return Promise.resolve(structuredClone(row));
				},
			),
			findMany: jest.fn(
				({
					where,
					skip = 0,
					take,
				}: {
					where: { ruleId: number };
					skip?: number;
					take: number;
				}) =>
					Promise.resolve(
						structuredClone(
							state.revisions
								.filter((r) => r.ruleId === where.ruleId)
								.sort((a, b) => b.version - a.version)
								.slice(skip, skip + take),
						),
					),
			),
			findUnique: jest.fn(
				({
					where,
				}: {
					where: {
						ruleId_version: { ruleId: number; version: number };
					};
				}) =>
					Promise.resolve(
						structuredClone(
							state.revisions.find(
								(r) =>
									r.ruleId === where.ruleId_version.ruleId &&
									r.version === where.ruleId_version.version,
							) ?? null,
						),
					),
			),
		},
		ruleAudit: {
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<RuleAudit, 'id' | 'reason'> & {
						reason?: string;
					};
				}) => {
					const row: RuleAudit = {
						...data,
						id: randomUUID(),
						reason: data.reason ?? null,
					};
					state.audits.push(row);
					return Promise.resolve(structuredClone(row));
				},
			),
		},
	};
	let queue: Promise<unknown> = Promise.resolve();
	const transaction = jest.fn(
		(work: (db: Prisma.TransactionClient) => Promise<unknown>) => {
			const run = async () => {
				const before = structuredClone(state);
				const beforeGroups = structuredClone(groups.state);
				try {
					return await work(
						tx as unknown as Prisma.TransactionClient,
					);
				} catch (error) {
					Object.assign(state, before);
					Object.assign(groups.state, beforeGroups);
					throw error;
				}
			};
			const pending = queue.then(run);
			queue = pending.catch(() => undefined);
			return pending;
		},
	);
	const prisma = {
		...tx,
		$transaction: transaction,
	} as unknown as PrismaService;
	return {
		groups,
		state,
		tx,
		transaction,
		prisma,
		provider: { provide: PrismaService, useValue: prisma },
	};
}
