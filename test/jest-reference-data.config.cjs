const security = require('./jest-api-security.config.cjs');
module.exports = {
	...security,
	testMatch: [...security.testMatch,
		'<rootDir>/src/reference-data/**/*.spec.ts',
		'<rootDir>/test/reference-data.e2e-spec.ts',
	],
};
