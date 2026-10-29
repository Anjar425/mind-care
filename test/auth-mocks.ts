export function createPrismaMock() {
	const data = {
		user: {
			findUnique: jest.fn<Promise<unknown>, [unknown]>(),
			findMany: jest.fn<Promise<unknown>, [unknown]>(),
			create: jest.fn<Promise<unknown>, [unknown]>(),
			update: jest.fn<Promise<unknown>, [unknown]>(),
			delete: jest.fn<Promise<unknown>, [unknown]>(),
		},
		refreshToken: {
			findFirst: jest.fn<Promise<unknown>, [unknown]>(),
			create: jest.fn<Promise<unknown>, [unknown]>(),
			updateMany: jest.fn<Promise<unknown>, [unknown]>(),
			deleteMany: jest.fn<Promise<unknown>, [unknown]>(),
		},
		passwordResetToken: {
			findFirst: jest.fn<Promise<unknown>, [unknown]>(),
			create: jest.fn<Promise<unknown>, [unknown]>(),
			updateMany: jest.fn<Promise<unknown>, [unknown]>(),
			deleteMany: jest.fn<Promise<unknown>, [unknown]>(),
		},
		emailVerificationToken: {
			findFirst: jest.fn<Promise<unknown>, [unknown]>(),
			create: jest.fn<Promise<unknown>, [unknown]>(),
			updateMany: jest.fn<Promise<unknown>, [unknown]>(),
		},
	};
	return {
		...data,
		$transaction: jest.fn(
			async (operation: (tx: typeof data) => Promise<unknown>) =>
				operation(data),
		),
	};
}

export const account = {
	id: '00000000-0000-4000-8000-000000000001',
	name: 'Example User',
	email: 'user@example.com',
	role: 'USER' as const,
	password: 'synthetic-password-hash',
	email_verified_at: null,
	created_at: new Date('2026-01-01T00:00:00.000Z'),
};
