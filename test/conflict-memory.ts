import { randomUUID } from 'node:crypto';

// Synthetic constraints/rollback support. This is not a PostgreSQL substitute.
type Row = { id: string; [key: string]: unknown };
type Args = {
	where?: Record<string, unknown>;
	data?: Record<string, unknown> | Record<string, unknown>[];
	skip?: number;
	take?: number;
	orderBy?: unknown;
	include?: unknown;
	select?: unknown;
	skipDuplicates?: boolean;
};
const project = (row: Row, select: unknown): Row =>
	select
		? (Object.fromEntries(
				Object.entries(select as Record<string, unknown>)
					.filter(([, enabled]) => enabled === true)
					.map(([key]) => [key, row[key]]),
			) as Row)
		: row;
function match(row: Row, where: Record<string, unknown> = {}): boolean {
	return Object.entries(where).every(([key, value]) => {
		if (key === 'OR')
			return (value as Record<string, unknown>[]).some((w) =>
				match(row, w),
			);
		if (
			value !== null &&
			typeof value === 'object' &&
			!(value instanceof Date)
		) {
			const filter = value as Record<string, unknown>;
			if ('in' in filter)
				return (filter.in as unknown[]).includes(row[key]);
			if ('not' in filter) return row[key] !== filter.not;
			if ('lte' in filter)
				return (row[key] as Date) <= (filter.lte as Date);
			// Prisma compound unique selector.
			return match(row, filter);
		}
		return row[key] === value;
	});
}
export function createConflictMemory(
	authorUserId: (expertId: string) => string,
) {
	const state: Record<string, Row[]> = {
		assessment: [],
		case: [],
		member: [],
		proposal: [],
		action: [],
		participant: [],
		decision: [],
		notice: [],
		audit: [],
	};
	const hydrate = (table: string, row: Row): Row => {
		if (table === 'case')
			return {
				...row,
				members: state.member
					.filter((m) => m.caseId === row.id)
					.sort((a, b) => (a.ruleId as number) - (b.ruleId as number))
					.map((m) => ({
						...m,
						author: {
							userId: authorUserId(m.authorExpertId as string),
						},
					})),
			};
		if (table === 'proposal')
			return {
				...row,
				case: hydrate(
					'case',
					state.case.find((c) => c.id === row.caseId)!,
				),
				actions: state.action
					.filter((a) => a.proposalId === row.id)
					.sort(
						(a, b) =>
							(a.position as number) - (b.position as number),
					),
				participants: state.participant
					.filter((p) => p.proposalId === row.id)
					.sort((a, b) =>
						String(a.expertId).localeCompare(String(b.expertId)),
					)
					.map((p) => ({
						...p,
						decision:
							state.decision.find(
								(d) => d.participantId === p.id,
							) ?? null,
					})),
			};
		return row;
	};
	const unique = (table: string, row: Row) => {
		const rows = state[table];
		const duplicate = rows.some(
			(r) =>
				r.id === row.id ||
				(table === 'assessment' &&
					r.groupId === row.groupId &&
					r.sourceHash === row.sourceHash &&
					r.comparisonVersion === row.comparisonVersion) ||
				(table === 'case' &&
					r.groupId === row.groupId &&
					r.caseKey === row.caseKey &&
					r.sourceHash === row.sourceHash) ||
				(table === 'proposal' &&
					r.caseId === row.caseId &&
					r.status === 'PENDING' &&
					row.status === 'PENDING') ||
				(table === 'decision' &&
					r.participantId === row.participantId) ||
				(table === 'notice' &&
					r.eventKey === row.eventKey &&
					r.recipientUserId === row.recipientUserId),
		);
		if (duplicate)
			throw Object.assign(
				new Error('Synthetic workflow unique constraint'),
				{ code: 'P2002' },
			);
	};
	const insert = (table: string, data: Record<string, unknown>): Row => {
		const { members, actions, participants, ...plain } = data;
		const row: Row = { id: randomUUID(), createdAt: new Date(), ...plain };
		if (table === 'case')
			Object.assign(row, { status: 'OPEN', closedAt: null });
		if (table === 'proposal')
			Object.assign(row, { status: 'PENDING', decidedAt: null });
		if (table === 'notice')
			Object.assign(row, { proposalId: null, readAt: null, ...plain });
		if (table === 'action') Object.assign(row, { content: null, ...plain });
		if (table === 'decision' || table === 'audit')
			Object.assign(row, { reason: null, ...plain });
		unique(table, row);
		state[table].push(row);
		for (const [child, link, nested] of [
			['member', 'caseId', members],
			['action', 'proposalId', actions],
			['participant', 'proposalId', participants],
		] as const)
			if (nested)
				for (const item of (
					nested as { create: Record<string, unknown>[] }
				).create)
					insert(child, { ...item, [link]: row.id });
		return structuredClone(hydrate(table, row));
	};
	const delegate = (table: string) => ({
		findUnique: jest.fn((a: Args) =>
			Promise.resolve(
				structuredClone(
					(() => {
						const r = state[table].find((r) => match(r, a.where));
						return r ? project(hydrate(table, r), a.select) : null;
					})(),
				),
			),
		),
		findFirst: jest.fn((a: Args) =>
			Promise.resolve(
				structuredClone(
					(() => {
						const r = state[table]
							.filter((r) => match(r, a.where))
							.sort(
								(a, b) =>
									(b.createdAt as Date).getTime() -
									(a.createdAt as Date).getTime(),
							)[0];
						return r ? project(hydrate(table, r), a.select) : null;
					})(),
				),
			),
		),
		findMany: jest.fn((a: Args = {}) =>
			Promise.resolve(
				structuredClone(
					state[table]
						.filter((r) => match(r, a.where))
						.sort(
							(a, b) =>
								(b.createdAt as Date).getTime() -
									(a.createdAt as Date).getTime() ||
								a.id.localeCompare(b.id),
						)
						.slice(
							a.skip ?? 0,
							(a.skip ?? 0) + (a.take ?? Number.MAX_SAFE_INTEGER),
						)
						.map((r) => project(hydrate(table, r), a.select)),
				),
			),
		),
		create: jest.fn((a: Args) =>
			Promise.resolve(insert(table, a.data as Record<string, unknown>)),
		),
		createMany: jest.fn((a: Args) => {
			let count = 0;
			for (const row of a.data as Record<string, unknown>[]) {
				try {
					insert(table, row);
					count++;
				} catch (e) {
					if (!a.skipDuplicates) throw e;
				}
			}
			return Promise.resolve({ count });
		}),
		update: jest.fn((a: Args) => {
			const row = state[table].find((r) => match(r, a.where));
			if (!row) throw new Error('Missing synthetic workflow row');
			Object.assign(row, a.data);
			return Promise.resolve(
				structuredClone(project(hydrate(table, row), a.select)),
			);
		}),
		updateMany: jest.fn((a: Args) => {
			const rows = state[table].filter((r) => match(r, a.where));
			for (const row of rows) Object.assign(row, a.data);
			return Promise.resolve({ count: rows.length });
		}),
	});
	return {
		state,
		tx: {
			ruleConflictAssessment: delegate('assessment'),
			ruleConflictCase: delegate('case'),
			ruleResolutionProposal: delegate('proposal'),
			ruleResolutionDecision: delegate('decision'),
			ruleConflictNotification: delegate('notice'),
			ruleConflictAudit: delegate('audit'),
		},
	};
}
