import { randomUUID } from 'node:crypto';
import type {
	Group,
	GroupAudit,
	GroupInvitation,
	GroupLeadershipTransfer,
	GroupMembership,
	Prisma,
} from '../src/prisma/generated/client';
import { PrismaService } from '../src/prisma/prisma.service';
import type { EligibilityGroup } from '../src/groups/group-eligibility.service';
import { completePreferenceRows } from './expert-preferences-mocks';
import { storedQuestions } from './reference-data-mocks';
import { credentialExpert } from './credential-mocks';

export const groupUserId = (n: number) =>
	`123e4567-e89b-42d3-a456-${String(1000 + n).padStart(12, '0')}`;
export const groupExpertId = (n: number) =>
	`123e4567-e89b-42d3-a456-${String(2000 + n).padStart(12, '0')}`;
type MockExpert = EligibilityGroup['memberships'][number]['expert'];
export function groupExpert(n: number): MockExpert {
	const credentials = credentialExpert();
	return {
		...credentials,
		id: groupExpertId(n),
		userId: groupUserId(n),
		user: { ...credentials.user, name: `Example Expert ${n}` },
		credentialRevisions: credentials.credentialRevisions.map((r) => ({
			...r,
			holderName: `Example Expert ${n}`,
		})),
		profileVersion: 1,
		profileValidatedAt: new Date('2026-01-01'),
		education: 'MASTER',
		publicationsNumber: 0,
		patientsNumber: 0,
		clinicalHours: 0,
		weight: {
			educationWeight: 25,
			publicationWeight: 25,
			patientWeight: 25,
			clinicalHoursWeight: 25,
		},
		preferences: completePreferenceRows(),
	};
}
type GrantWhere = {
	groupId?: number;
	recipientUserId?: string;
	targetExpertId?: string;
	status?: string;
	expiresAt?: { lte: Date };
};
const matchesGrant = (
	g: GroupInvitation | GroupLeadershipTransfer,
	w: GrantWhere,
) =>
	(w.groupId === undefined || g.groupId === w.groupId) &&
	(!w.status || g.status === w.status) &&
	(!w.recipientUserId ||
		('recipientUserId' in g && g.recipientUserId === w.recipientUserId)) &&
	(!w.targetExpertId ||
		('targetExpertId' in g && g.targetExpertId === w.targetExpertId)) &&
	(!w.expiresAt || g.expiresAt <= w.expiresAt.lte);

// Synthetic persistence serializes transactions and restores state on failure.
// It cannot prove PostgreSQL isolation, query plans or deployment constraints.
export function createGroupsMocks() {
	const state: {
		experts: MockExpert[];
		groups: Group[];
		memberships: GroupMembership[];
		invitations: GroupInvitation[];
		transfers: GroupLeadershipTransfer[];
		audits: GroupAudit[];
		nextGroup: number;
	} = {
		experts: Array.from({ length: 7 }, (_, i) => groupExpert(i + 1)),
		groups: [],
		memberships: [],
		invitations: [],
		transfers: [],
		audits: [],
		nextGroup: 1,
	};
	const snapshotGroup = (g: Group, activeOnly = false) =>
		structuredClone({
			...g,
			memberships: state.memberships
				.filter(
					(m) =>
						m.groupId === g.id &&
						(!activeOnly || m.status === 'ACTIVE'),
				)
				.map((m) => ({
					...m,
					expert: state.experts.find((e) => e.id === m.expertId)!,
				})),
		});
	const findGroup = (id: number) => state.groups.find((g) => g.id === id);
	const memberCreate = (
		data: Partial<GroupMembership> &
			Pick<GroupMembership, 'groupId' | 'expertId' | 'role'>,
	) => {
		if (
			state.memberships.some(
				(m) =>
					m.groupId === data.groupId && m.expertId === data.expertId,
			)
		)
			throw Object.assign(new Error('Synthetic unique constraint'), {
				code: 'P2002',
			});
		const row: GroupMembership = {
			id: randomUUID(),
			status: 'ACTIVE',
			joinedAt: new Date(),
			leftAt: null,
			...data,
		};
		state.memberships.push(row);
		return structuredClone(row);
	};
	const tx = {
		user: {
			findUnique: jest.fn(({ where }: { where: { id: string } }) => {
				const e = state.experts.find((e) => e.userId === where.id);
				return Promise.resolve(
					e
						? { id: e.userId, ...e.user, expert: { id: e.id } }
						: null,
				);
			}),
		},
		expert: {
			findUnique: jest.fn(
				({ where }: { where: { id?: string; userId?: string } }) =>
					Promise.resolve(
						structuredClone(
							state.experts.find((e) =>
								where.id
									? e.id === where.id
									: e.userId === where.userId,
							) ?? null,
						),
					),
			),
		},
		dASS21: {
			findMany: jest.fn(() => Promise.resolve(storedQuestions('DASS21'))),
		},
		group: {
			findUnique: jest.fn(
				({
					where,
					select,
				}: {
					where: { id: number };
					select?: unknown;
				}) =>
					Promise.resolve(
						findGroup(where.id)
							? snapshotGroup(findGroup(where.id)!, !!select)
							: null,
					),
			),
			findMany: jest.fn(
				(args: {
					where?: {
						archivedAt?: null;
						memberships?: {
							some: { expertId: string; status: string };
						};
					};
					select?: unknown;
					skip?: number;
					take?: number;
				}) => {
					let rows = state.groups.filter(
						(g) =>
							(!args.where ||
								args.where.archivedAt !== null ||
								!g.archivedAt) &&
							(!args.where?.memberships ||
								state.memberships.some(
									(m) =>
										m.groupId === g.id &&
										m.expertId ===
											args.where!.memberships!.some
												.expertId &&
										m.status ===
											args.where!.memberships!.some
												.status,
								)),
					);
					rows = rows.sort(
						(a, b) =>
							b.updatedAt.getTime() - a.updatedAt.getTime() ||
							a.id - b.id,
					);
					return Promise.resolve(
						rows
							.slice(
								args.skip ?? 0,
								args.take === undefined
									? undefined
									: (args.skip ?? 0) + args.take,
							)
							.map((g) => snapshotGroup(g, !!args.select)),
					);
				},
			),
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<Group, 'id' | 'archivedAt'> & {
						memberships: {
							create: Pick<
								GroupMembership,
								'expertId' | 'role' | 'status' | 'joinedAt'
							>;
						};
					};
				}) => {
					const { memberships, ...metadata } = data;
					const row: Group = {
						...metadata,
						id: state.nextGroup++,
						archivedAt: null,
					};
					state.groups.push(row);
					memberCreate({ groupId: row.id, ...memberships.create });
					return Promise.resolve(snapshotGroup(row));
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: number };
					data: Partial<Group>;
				}) => {
					const g = findGroup(where.id)!;
					Object.assign(g, data);
					return Promise.resolve(structuredClone(g));
				},
			),
		},
		groupMembership: {
			upsert: jest.fn(
				({
					where,
					create,
					update,
				}: {
					where: {
						groupId_expertId: { groupId: number; expertId: string };
					};
					create: Partial<GroupMembership> &
						Pick<GroupMembership, 'groupId' | 'expertId' | 'role'>;
					update: Partial<GroupMembership>;
				}) => {
					const key = where.groupId_expertId;
					const row = state.memberships.find(
						(m) =>
							m.groupId === key.groupId &&
							m.expertId === key.expertId,
					);
					if (row) {
						Object.assign(row, update);
						return Promise.resolve(structuredClone(row));
					}
					return Promise.resolve(memberCreate(create));
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<GroupMembership>;
				}) => {
					const row = state.memberships.find(
						(m) => m.id === where.id,
					)!;
					if (
						data.role === 'LEADER' &&
						state.memberships.some(
							(m) =>
								m.groupId === row.groupId &&
								m.id !== row.id &&
								m.role === 'LEADER' &&
								m.status === 'ACTIVE',
						)
					)
						throw Object.assign(
							new Error('Synthetic unique constraint'),
							{ code: 'P2002' },
						);
					Object.assign(row, data);
					return Promise.resolve(structuredClone(row));
				},
			),
		},
		groupInvitation: {
			findUnique: jest.fn(({ where }: { where: { id: string } }) =>
				Promise.resolve(
					structuredClone(
						state.invitations.find((g) => g.id === where.id) ??
							null,
					),
				),
			),
			findFirst: jest.fn(({ where }: { where: GrantWhere }) =>
				Promise.resolve(
					structuredClone(
						state.invitations.find((g) => matchesGrant(g, where)) ??
							null,
					),
				),
			),
			findMany: jest.fn(
				({
					where,
					skip = 0,
					take,
				}: {
					where: GrantWhere;
					skip?: number;
					take?: number;
				}) =>
					Promise.resolve(
						structuredClone(
							state.invitations
								.filter((g) => matchesGrant(g, where))
								.sort(
									(a, b) =>
										b.createdAt.getTime() -
											a.createdAt.getTime() ||
										a.id.localeCompare(b.id),
								)
								.slice(
									skip,
									take === undefined
										? undefined
										: skip + take,
								),
						),
					),
			),
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<GroupInvitation, 'id' | 'status' | 'decidedAt'>;
				}) => {
					if (
						state.invitations.some(
							(g) =>
								g.groupId === data.groupId &&
								g.recipientUserId === data.recipientUserId &&
								g.status === 'PENDING',
						)
					)
						throw Object.assign(
							new Error('Synthetic unique constraint'),
							{ code: 'P2002' },
						);
					const row: GroupInvitation = {
						...data,
						id: randomUUID(),
						status: 'PENDING',
						decidedAt: null,
					};
					state.invitations.push(row);
					return Promise.resolve(structuredClone(row));
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<GroupInvitation>;
				}) => {
					const g = state.invitations.find((g) => g.id === where.id)!;
					Object.assign(g, data);
					return Promise.resolve(structuredClone(g));
				},
			),
			updateMany: jest.fn(
				({
					where,
					data,
				}: {
					where: GrantWhere;
					data: Partial<GroupInvitation>;
				}) => {
					const rows = state.invitations.filter((g) =>
						matchesGrant(g, where),
					);
					rows.forEach((g) => Object.assign(g, data));
					return Promise.resolve({ count: rows.length });
				},
			),
		},
		groupLeadershipTransfer: {
			findUnique: jest.fn(({ where }: { where: { id: string } }) => {
				const g = state.transfers.find((g) => g.id === where.id);
				return Promise.resolve(
					g
						? structuredClone({
								...g,
								proposedBy: state.experts.find(
									(e) => e.id === g.proposedByExpertId,
								)!,
								target: state.experts.find(
									(e) => e.id === g.targetExpertId,
								)!,
							})
						: null,
				);
			}),
			findFirst: jest.fn(({ where }: { where: GrantWhere }) =>
				Promise.resolve(
					structuredClone(
						state.transfers.find((g) => matchesGrant(g, where)) ??
							null,
					),
				),
			),
			findMany: jest.fn(
				({
					where,
					skip = 0,
					take,
				}: {
					where: GrantWhere;
					skip?: number;
					take?: number;
				}) =>
					Promise.resolve(
						structuredClone(
							state.transfers
								.filter((g) => matchesGrant(g, where))
								.sort(
									(a, b) =>
										b.createdAt.getTime() -
											a.createdAt.getTime() ||
										a.id.localeCompare(b.id),
								)
								.slice(
									skip,
									take === undefined
										? undefined
										: skip + take,
								),
						),
					),
			),
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<
						GroupLeadershipTransfer,
						'id' | 'status' | 'decidedAt'
					>;
				}) => {
					if (
						state.transfers.some(
							(g) =>
								g.groupId === data.groupId &&
								g.status === 'PENDING',
						)
					)
						throw Object.assign(
							new Error('Synthetic unique constraint'),
							{ code: 'P2002' },
						);
					const row: GroupLeadershipTransfer = {
						...data,
						id: randomUUID(),
						status: 'PENDING',
						decidedAt: null,
					};
					state.transfers.push(row);
					return Promise.resolve(structuredClone(row));
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<GroupLeadershipTransfer>;
				}) => {
					const g = state.transfers.find((g) => g.id === where.id)!;
					Object.assign(g, data);
					return Promise.resolve(structuredClone(g));
				},
			),
			updateMany: jest.fn(
				({
					where,
					data,
				}: {
					where: GrantWhere;
					data: Partial<GroupLeadershipTransfer>;
				}) => {
					const rows = state.transfers.filter((g) =>
						matchesGrant(g, where),
					);
					rows.forEach((g) => Object.assign(g, data));
					return Promise.resolve({ count: rows.length });
				},
			),
		},
		groupAudit: {
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<
						GroupAudit,
						| 'id'
						| 'reason'
						| 'affectedExpertId'
						| 'invitationId'
						| 'transferId'
					> &
						Partial<GroupAudit>;
				}) => {
					const row: GroupAudit = {
						id: randomUUID(),
						reason: null,
						affectedExpertId: null,
						invitationId: null,
						transferId: null,
						...data,
					};
					state.audits.push(row);
					return Promise.resolve(structuredClone(row));
				},
			),
			findMany: jest.fn(
				({
					where,
					skip = 0,
					take,
				}: {
					where: { groupId: number };
					skip?: number;
					take: number;
				}) =>
					Promise.resolve(
						structuredClone(
							state.audits
								.filter((a) => a.groupId === where.groupId)
								.sort(
									(a, b) =>
										b.createdAt.getTime() -
											a.createdAt.getTime() ||
										a.id.localeCompare(b.id),
								)
								.slice(skip, skip + take)
								.map((a) => ({
									id: a.id,
									action: a.action,
									actorUserId: a.actorUserId,
									affectedExpertId: a.affectedExpertId,
									invitationId: a.invitationId,
									transferId: a.transferId,
									reason: a.reason,
									createdAt: a.createdAt,
								})),
						),
					),
			),
		},
		$queryRaw: jest.fn().mockResolvedValue([]),
	};
	let queue: Promise<unknown> = Promise.resolve();
	const transaction = jest.fn(
		(work: (db: Prisma.TransactionClient) => Promise<unknown>) => {
			const run = async () => {
				const before = structuredClone(state);
				try {
					return await work(
						tx as unknown as Prisma.TransactionClient,
					);
				} catch (error) {
					Object.assign(state, before);
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
	const seedGroup = (members: number[], archived = false) => {
		const now = new Date('2026-01-01');
		const group: Group = {
			id: state.nextGroup++,
			name: 'Example group',
			description: 'Professional screening group',
			createdAt: now,
			updatedAt: now,
			archivedAt: archived ? now : null,
		};
		state.groups.push(group);
		members.forEach((n, i) =>
			memberCreate({
				groupId: group.id,
				expertId: groupExpertId(n),
				role: i === 0 ? 'LEADER' : 'MEMBER',
				joinedAt: now,
			}),
		);
		return group.id;
	};
	return {
		state,
		tx,
		prisma,
		transaction,
		seedGroup,
		snapshotGroup,
		provider: { provide: PrismaService, useValue: prisma },
	};
}
