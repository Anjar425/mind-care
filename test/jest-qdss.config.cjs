const conflicts = require('./jest-rule-conflicts.config.cjs');
module.exports = {
	...conflicts,
	testMatch: [
		...conflicts.testMatch,
		'<rootDir>/src/qdss/**/*.spec.ts',
		'<rootDir>/test/qdss.e2e-spec.ts',
	],
};
