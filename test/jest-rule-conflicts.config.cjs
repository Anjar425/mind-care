const rules = require('./jest-rules.config.cjs');
module.exports = {
	...rules,
	testMatch: [
		...rules.testMatch,
		'<rootDir>/src/rule-conflicts/**/*.spec.ts',
		'<rootDir>/test/rule-conflicts.e2e-spec.ts',
	],
};
