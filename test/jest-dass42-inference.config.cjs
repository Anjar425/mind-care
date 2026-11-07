const qdss = require('./jest-qdss.config.cjs');
module.exports = {
	...qdss,
	testMatch: [
		...qdss.testMatch,
		'<rootDir>/src/dass42-inference/**/*.spec.ts',
		'<rootDir>/src/rule-conflicts/rule-conflict-core.service.spec.ts',
		'<rootDir>/test/dass42-inference.integration-spec.ts',
	],
};
