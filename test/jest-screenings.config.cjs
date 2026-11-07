const history = require('./jest-history.config.cjs');
module.exports = {
	...history,
	testMatch: [
		...history.testMatch,
		'<rootDir>/src/screenings/**/*.spec.ts',
		'<rootDir>/test/screenings.e2e-spec.ts',
	],
};
