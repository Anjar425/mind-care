// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer boundaries (see README "Source layout"). Specs may import across layers for fixtures.
// A relative specifier reaches another top-level folder of src/ only through "../" segments,
// so `^(\.\./)+<folder>/` (or the `@/<parent>/<folder>/` alias) identifies an import of it.
const reach = (folders, parent = '') =>
	`^((\\.\\./)+|@/${parent})(${folders.join('|')})(/|$)`;
const boundary = (files, folders, message, extra = [], parent = '') => ({
	files,
	ignores: ['**/*.spec.ts'],
	rules: {
		'no-restricted-imports': [
			'error',
			{
				patterns: [
					{ regex: reach(folders, parent), message },
					...extra,
				],
			},
		],
	},
});
const AUDIENCES = ['public', 'account', 'expert', 'admin', 'health'];
const otherAudiences = (audience) =>
	boundary(
		[`src/api/${audience}/**/*.ts`],
		AUDIENCES.filter((a) => a !== audience),
		'An audience folder never imports another one; share code through api/common.',
		[],
		'api/',
	);
const LAYERS = [
	boundary(
		['src/domain/**/*.ts'],
		['api', 'jobs', 'client-sdk'],
		'Domain code must not depend on HTTP, jobs or the browser SDK.',
	),
	boundary(
		['src/jobs/**/*.ts'],
		['api', 'client-sdk'],
		'Jobs use domain services, never HTTP code.',
	),
	boundary(
		['src/infrastructure/**/*.ts'],
		['api', 'domain', 'jobs', 'client-sdk'],
		'Infrastructure is framework plumbing; it must not know the business or HTTP layers.',
	),
	boundary(
		['src/shared/**/*.ts'],
		['api', 'domain', 'jobs', 'infrastructure', 'client-sdk'],
		'shared/ is framework-free and imports nothing project-internal.',
		[{ regex: '^@nestjs/', message: 'shared/ is framework-free.' }],
	),
	boundary(
		['src/api/common/**/*.ts'],
		['public', 'account', 'expert', 'admin'],
		'api/common is used by every audience and must not import one.',
		[],
		'api/',
	),
	...AUDIENCES.map(otherAudiences),
	boundary(
		['src/client-sdk/**/*.ts'],
		['api', 'domain', 'jobs', 'infrastructure'],
		'The browser SDK may only import shared/contracts.',
		[
			{
				regex: '^(\\.\\./)+shared/(?!contracts/)',
				message: 'The browser SDK may only import shared/contracts.',
			},
			{
				regex: '^(@nestjs/|node:)',
				message: 'The browser SDK runs in browsers only.',
			},
		],
	),
];

export default tseslint.config(
	{
		ignores: [
			'eslint.config.mjs',
			'src/infrastructure/prisma/generated/**',
			'dist/**',
			'coverage/**',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	eslintPluginPrettierRecommended,
	{
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
			sourceType: 'commonjs',
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-unsafe-argument': 'warn',
		},
	},
	...LAYERS,
);
