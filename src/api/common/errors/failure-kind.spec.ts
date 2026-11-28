import { HttpException } from '@nestjs/common';
import { failureKind } from './failure-kind';

function withStack(error: Error, frames: string[]): Error {
	error.stack = [`${error.name}: ${error.message}`, ...frames].join('\n');
	return error;
}

describe('failureKind', () => {
	it('should name the class and the first application frame, skipping dependencies', () => {
		const error = withStack(
			new Error('Bad "options.expiresIn" PRIVATE_TOKEN'),
			[
				'    at module.exports [as sign] (/app/node_modules/jsonwebtoken/sign.js:163:20)',
				'    at JwtService.sign (/app/node_modules/@nestjs/jwt/dist/jwt.service.js:41:20)',
				'    at AuthSessionService.sign (/app/dist/domain/identity/auth-session.service.js:164:36)',
				'    at async withTransaction (/app/dist/infrastructure/prisma/transaction.js:18:20)',
			],
		);
		expect(failureKind(error)).toBe(
			'Error at domain/identity/auth-session.service.js:164',
		);
	});

	it('should read Windows paths and source files and keep only the path below src or dist', () => {
		const error = withStack(new TypeError('PRIVATE'), [
			'    at Object.run (C:\\Users\\someone\\src\\mind-care\\src\\domain\\qdss\\math\\ga.ts:42:7)',
		]);
		expect(failureKind(error)).toBe(
			'TypeError at domain/qdss/math/ga.ts:42',
		);
	});

	it('should include symbolic database and system codes only', () => {
		expect(failureKind({ code: 'P2025', detail: 'PRIVATE_DB_VALUE' })).toBe(
			'Object P2025',
		);
		const network = Object.assign(new Error('PRIVATE'), {
			code: 'ECONNREFUSED',
			stack: undefined,
		});
		expect(failureKind(network)).toBe('Error ECONNREFUSED');
		expect(failureKind({ code: 'user@example.test' })).toBe('Object');
	});

	it('should describe non-objects without their value', () => {
		expect(failureKind('PRIVATE_VALUE')).toBe('string');
		expect(failureKind(null)).toBe('null');
		expect(failureKind(undefined)).toBe('undefined');
	});

	it('should never contain the exception message or response body', () => {
		const http = new HttpException({ message: 'PRIVATE_TOKEN' }, 500);
		const objectWithoutStack = Object.create(null) as object;
		for (const error of [http, new Error('PRIVATE'), objectWithoutStack])
			expect(failureKind(error)).not.toContain('PRIVATE');
	});
});
