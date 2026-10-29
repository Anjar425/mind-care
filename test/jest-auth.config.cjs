module.exports = {
	rootDir: '..',
	testEnvironment: 'node',
	testMatch: [
		'<rootDir>/src/auth/**/*.spec.ts',
		'<rootDir>/src/user/user.service.spec.ts',
		'<rootDir>/src/common/utils/account-validation.util.spec.ts',
		'<rootDir>/test/auth.e2e-spec.ts',
	],
	moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
	setupFilesAfterEnv: ['<rootDir>/test/auth-test.setup.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
	},
	clearMocks: true,
	cacheDirectory: '<rootDir>/node_modules/.cache/jest-auth',
};
