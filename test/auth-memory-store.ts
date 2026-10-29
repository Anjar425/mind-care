import { randomUUID } from 'node:crypto';
import { UserRole } from '@/common/constant/role.constant';

interface TestUser {
	id: string;
	name: string;
	email: string;
	password: string;
	role: UserRole;
	email_verified_at: Date | null;
	created_at: Date;
}
interface TestSession {
	id: string;
	userId: string;
	token: string;
	expiresAt: Date;
}
interface TestToken {
	id: string;
	userId: string;
	tokenHash: string;
	expiresAt: Date;
	usedAt: Date | null;
}
interface SessionWhere {
	id?: string;
	userId?: string;
	token?: string;
	expiresAt?: { gt: Date };
}
interface TokenWhere {
	id?: string;
	userId?: string;
	tokenHash?: string;
	usedAt?: null;
	expiresAt?: { gt: Date };
}

// Test-only adapter for HTTP wiring; it does not prove PostgreSQL isolation/rollback.
export function createAuthMemoryStore(password: string) {
	const users = new Map<string, TestUser>();
	const sessions = new Map<string, TestSession>();
	const resets = new Map<string, TestToken>();
	const verifications = new Map<string, TestToken>();
	for (const role of [UserRole.USER, UserRole.EXPERT, UserRole.ADMIN]) {
		users.set(role, {
			id: role,
			name: `Example ${role}`,
			email: `${role.toLowerCase()}@example.com`,
			password,
			role,
			email_verified_at: null,
			created_at: new Date(),
		});
	}
	const sessionMatches = (row: TestSession, where: SessionWhere) =>
		(where.id === undefined || row.id === where.id) &&
		(where.userId === undefined || row.userId === where.userId) &&
		(where.token === undefined || row.token === where.token) &&
		(!where.expiresAt || row.expiresAt > where.expiresAt.gt);
	const tokenMatches = (row: TestToken, where: TokenWhere) =>
		(where.id === undefined || row.id === where.id) &&
		(where.userId === undefined || row.userId === where.userId) &&
		(where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
		(where.usedAt === undefined || row.usedAt === null) &&
		(!where.expiresAt || row.expiresAt > where.expiresAt.gt);
	const tokenDelegate = (records: Map<string, TestToken>) => ({
		findFirst: jest.fn(({ where }: { where: TokenWhere }) =>
			Promise.resolve(
				[...records.values()].find((row) => tokenMatches(row, where)) ??
					null,
			),
		),
		create: jest.fn(
			({ data }: { data: Omit<TestToken, 'id' | 'usedAt'> }) => {
				const row = { ...data, id: randomUUID(), usedAt: null };
				records.set(row.id, row);
				return Promise.resolve(row);
			},
		),
		updateMany: jest.fn(
			({
				where,
				data,
			}: {
				where: TokenWhere;
				data: { usedAt: Date };
			}) => {
				let count = 0;
				for (const row of records.values())
					if (tokenMatches(row, where)) {
						row.usedAt = data.usedAt;
						count++;
					}
				return Promise.resolve({ count });
			},
		),
	});
	const delegates = {
		user: {
			findMany: jest.fn(
				({ where }: { where: { email: { contains: string } } }) =>
					Promise.resolve(
						[...users.values()].filter((row) =>
							row.email
								.toLowerCase()
								.includes(where.email.contains.toLowerCase()),
						),
					),
			),
			findUnique: jest.fn(({ where }: { where: { id: string } }) =>
				Promise.resolve(users.get(where.id) ?? null),
			),
			create: jest.fn(
				({
					data,
				}: {
					data: Omit<TestUser, 'id' | 'email_verified_at'>;
				}) => {
					const row = {
						...data,
						id: randomUUID(),
						email_verified_at: null,
					};
					users.set(row.id, row);
					return Promise.resolve(row);
				},
			),
			update: jest.fn(
				({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<TestUser>;
				}) => {
					const current = users.get(where.id);
					if (!current)
						return Promise.reject(
							new Error('Missing synthetic account'),
						);
					Object.assign(current, data);
					return Promise.resolve(current);
				},
			),
		},
		refreshToken: {
			findFirst: jest.fn(({ where }: { where: SessionWhere }) => {
				const row = [...sessions.values()].find((entry) =>
					sessionMatches(entry, where),
				);
				const user = row ? users.get(row.userId) : undefined;
				return Promise.resolve(
					row && user ? { ...row, user: { ...user } } : null,
				);
			}),
			create: jest.fn(({ data }: { data: TestSession }) => {
				sessions.set(data.id, { ...data });
				return Promise.resolve(data);
			}),
			updateMany: jest.fn(
				({
					where,
					data,
				}: {
					where: SessionWhere;
					data: { token: string };
				}) => {
					let count = 0;
					for (const row of sessions.values())
						if (sessionMatches(row, where)) {
							row.token = data.token;
							count++;
						}
					return Promise.resolve({ count });
				},
			),
			deleteMany: jest.fn(({ where }: { where: SessionWhere }) => {
				let count = 0;
				for (const [id, row] of sessions)
					if (sessionMatches(row, where)) {
						sessions.delete(id);
						count++;
					}
				return Promise.resolve({ count });
			}),
		},
		passwordResetToken: tokenDelegate(resets),
		emailVerificationToken: tokenDelegate(verifications),
	};
	return {
		users,
		sessions,
		resets,
		verifications,
		prisma: {
			...delegates,
			$transaction: jest.fn(
				(operation: (tx: typeof delegates) => Promise<unknown>) =>
					operation(delegates),
			),
		},
	};
}
