const credentials = require('./jest-expert-credentials.config.cjs');
module.exports = {
	...credentials,
	testMatch: [
		...credentials.testMatch,
		'<rootDir>/src/expert/expert-profile*.spec.ts',
		'<rootDir>/src/expert/expert.module.spec.ts',
		'<rootDir>/test/expert-profile.e2e-spec.ts',
	],
};
