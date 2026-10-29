import {
	ArgumentsHost,
	BadRequestException,
	HttpException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { AuthExceptionFilter } from './auth-exception.filter';

describe('AuthExceptionFilter', () => {
	let filter: AuthExceptionFilter;
	let response: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
	let host: ArgumentsHost;
	let logError: jest.SpyInstance;
	beforeEach(() => {
		filter = new AuthExceptionFilter();
		response = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
			setHeader: jest.fn(),
		};
		host = {
			switchToHttp: () => ({ getResponse: () => response }),
		} as unknown as ArgumentsHost;
		logError = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.clearAllMocks();
		jest.restoreAllMocks();
	});
	it('should return typed validation errors when a request is invalid', () => {
		filter.catch(new BadRequestException(['email must be an email']), host);
		expect(response.status).toHaveBeenCalledWith(400);
		expect(response.json).toHaveBeenCalledWith({
			statusCode: 400,
			message: ['email must be an email'],
			error: 'Bad Request',
		});
	});
	it('should provide a bearer challenge when authentication is rejected', () => {
		filter.catch(new UnauthorizedException('Invalid credentials'), host);
		expect(response.setHeader).toHaveBeenCalledWith(
			'WWW-Authenticate',
			'Bearer',
		);
		expect(response.status).toHaveBeenCalledWith(401);
	});
	it.each([
		new Error('PRIVATE_HASH'),
		new HttpException('PRIVATE_TOKEN', 500),
		{ code: 'P2025', detail: 'PRIVATE_DB_VALUE' },
	])(
		'should hide exception details when a server failure occurs (%p)',
		(error) => {
			filter.catch(error, host);
			expect(response.json).toHaveBeenCalledWith({
				statusCode: 500,
				message: ['Internal server error'],
				error: 'Internal Server Error',
			});
			expect(logError).toHaveBeenCalledWith(
				'Authentication request failed',
			);
		},
	);
	it('should ignore malformed message entries when an HTTP error has an unusual shape', () => {
		filter.catch(
			new HttpException(
				{ message: ['Valid', 123], error: 'Rejected' },
				400,
			),
			host,
		);
		expect(response.json).toHaveBeenCalledWith({
			statusCode: 400,
			message: ['Valid'],
			error: 'Rejected',
		});
	});
});
