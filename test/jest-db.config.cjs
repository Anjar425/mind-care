// Real-PostgreSQL tests. Never part of `pnpm test`.
// Requires DB_TEST_DATABASE_URL pointing at a disposable database whose name ends in "_test";
// the database is reset (all data dropped) before the run.
module.exports = {
	rootDir: '..',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/test/db/**/*.db-spec.ts'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
	},
	globalSetup: '<rootDir>/test/db/global-setup.ts',
	testTimeout: 30000,
	maxWorkers: 1,
	cacheDirectory: '<rootDir>/node_modules/.cache/jest-db',
};
