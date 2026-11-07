const foundation = require('./jest-api-foundation.config.cjs');
module.exports = {
	...foundation,
	testMatch: [
		...foundation.testMatch,
		'<rootDir>/src/common/config/**/*.spec.ts',
		'<rootDir>/src/common/guards/api-rate-limit.guard.spec.ts',
		'<rootDir>/src/health/**/*.spec.ts',
		'<rootDir>/src/prisma/prisma.service.spec.ts',
		'<rootDir>/src/mail/**/*.spec.ts',
		'<rootDir>/src/common/utils/html.util.spec.ts',
		'<rootDir>/test/api-security.e2e-spec.ts',
	],
};
