const inference = require('./jest-dass42-inference.config.cjs');
module.exports = {
	...inference,
	testMatch: [
		...inference.testMatch,
		'<rootDir>/src/history/**/*.spec.ts',
		'<rootDir>/test/history.e2e-spec.ts',
	],
};
