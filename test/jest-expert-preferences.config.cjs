const profile = require('./jest-expert-profile.config.cjs');
module.exports = {
	...profile,
	testMatch: [
		...profile.testMatch,
		'<rootDir>/src/expert-preferences/**/*.spec.ts',
		'<rootDir>/test/expert-preferences.e2e-spec.ts',
	],
};
