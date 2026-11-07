// Canonical Jest entry point: every unit spec and isolated (in-memory) e2e spec.
// Feature configs in test/jest-*.config.cjs remain for focused runs.
// Real-PostgreSQL tests live in test/db and run only via test/jest-db.config.cjs.
const base = require('./test/jest-screenings.config.cjs');

module.exports = {
	...base,
	rootDir: '.',
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
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.spec.ts',
		'!src/prisma/generated/**',
		'!src/main.ts',
	],
	coverageDirectory: '<rootDir>/coverage',
};
