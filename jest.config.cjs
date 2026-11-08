// Single Jest entry point: every unit spec and isolated (in-memory) e2e spec.
// Focus a run with a path pattern, e.g. `pnpm test -- src/domain/qdss`.
// Real-PostgreSQL tests live in test/db and run only via test/jest-db.config.cjs.
module.exports = {
	rootDir: '.',
	testEnvironment: 'node',
	testMatch: [
		'<rootDir>/src/**/*.spec.ts',
		'<rootDir>/test/**/*.e2e-spec.ts',
		'<rootDir>/test/**/*.integration-spec.ts',
	],
	testPathIgnorePatterns: [
		'/node_modules/',
		'<rootDir>/test/db/',
		'<rootDir>/dist/',
	],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	setupFilesAfterEnv: ['<rootDir>/test/auth-test.setup.ts'],
	transform: {
		'^.+\\.ts$':['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
	},
	clearMocks: true,
	cacheDirectory: '<rootDir>/node_modules/.cache/jest',
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.spec.ts',
		'!src/infrastructure/prisma/generated/**',
		'!src/main.ts',
	],
	coverageDirectory: '<rootDir>/coverage',
};
