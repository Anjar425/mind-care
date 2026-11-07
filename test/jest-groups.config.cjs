const preferences = require('./jest-expert-preferences.config.cjs');
module.exports = {
	...preferences,
	testMatch: [
		...preferences.testMatch,
		'<rootDir>/src/groups/**/*.spec.ts',
		'<rootDir>/test/groups.e2e-spec.ts',
	],
};
