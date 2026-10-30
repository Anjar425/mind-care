const reference = require('./jest-reference-data.config.cjs');
module.exports = {
	...reference,
	moduleNameMapper: {
		...reference.moduleNameMapper,
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	testMatch: [
		...reference.testMatch,
		'<rootDir>/src/expert-credentials/**/*.spec.ts',
		'<rootDir>/test/expert-credentials.e2e-spec.ts',
	],
};
