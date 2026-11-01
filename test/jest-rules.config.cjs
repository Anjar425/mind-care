const groups = require('./jest-groups.config.cjs');
module.exports = {
	...groups,
	testMatch: [
		...groups.testMatch,
		'<rootDir>/src/rules/**/*.spec.ts',
		'<rootDir>/test/rules.e2e-spec.ts',
	],
};
