const auth = require('./jest-auth.config.cjs');
module.exports = {
	...auth,
	testMatch: [
		...auth.testMatch,
		'<rootDir>/src/common/filter/http-exception/http-exception.filter.spec.ts',
		'<rootDir>/src/common/interceptor/response/response.interceptor.spec.ts',
		'<rootDir>/src/common/decorator/api/*.spec.ts',
		'<rootDir>/test/api-foundation.e2e-spec.ts',
	],
};
