import {
	ArgumentsHost,
	BadRequestException,
	HttpException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

const EXPECTED_CODE: Record<number, string> = {
	400: 'VALIDATION_FAILED',
	401: 'UNAUTHENTICATED',
	403: 'FORBIDDEN',
	404: 'NOT_FOUND',
	409: 'CONFLICT',
};

describe('GlobalExceptionFilter', () => {
	let filter: GlobalExceptionFilter;
	let host: ArgumentsHost;
	let response: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
	let log: jest.SpyInstance;
	beforeEach(() => {
		filter = new GlobalExceptionFilter();
		response = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
			setHeader: jest.fn(),
		};
		host = {
			switchToHttp: () => ({ getResponse: () => response }),
		} as unknown as ArgumentsHost;
		log = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.clearAllMocks();
		jest.restoreAllMocks();
	});
	it.each([400, 401, 403, 404, 409])(
		'should preserve controlled errors when HTTP status is %p',
		(status) => {
			filter.catch(
				new HttpException(
					{ message: 'Controlled failure', error: 'Rejected' },
					status,
				),
				host,
			);
			expect(response.json).toHaveBeenCalledWith({
				statusCode: status,
				code: EXPECTED_CODE[status],
				message: ['Controlled failure'],
				error: 'Rejected',
			});
			expect(log).not.toHaveBeenCalled();
		},
	);
	it('should preserve validation messages when several fields are invalid', () => {
		filter.catch(
			new BadRequestException(['page is invalid', 'limit is invalid']),
			host,
		);
		expect(response.json).toHaveBeenCalledWith({
			statusCode: 400,
			code: 'VALIDATION_FAILED',
			message: ['page is invalid', 'limit is invalid'],
			error: 'Bad Request',
		});
	});
	it('should add a bearer challenge when authentication is denied', () => {
		filter.catch(new UnauthorizedException(), host);
		expect(response.setHeader).toHaveBeenCalledWith(
			'WWW-Authenticate',
			'Bearer',
		);
	});
	it.each([
		new Error('PRIVATE_TOKEN'),
		{ code: 'P2002', detail: 'PRIVATE_DB' },
		null,
		'PRIVATE_VALUE',
		new HttpException('PRIVATE_PROVIDER', 500),
	])('should sanitize failures when a server error occurs (%p)', (error) => {
		filter.catch(error, host);
		expect(response.json).toHaveBeenCalledWith({
			statusCode: 500,
			code: 'INTERNAL_ERROR',
			message: ['Internal server error'],
			error: 'Internal Server Error',
		});
		expect(log).toHaveBeenCalledWith('API request failed');
		expect(JSON.stringify(response.json.mock.calls)).not.toContain(
			'PRIVATE',
		);
	});
	it('should retain availability status when a controlled 503 hides sensitive details', () => {
		filter.catch(new HttpException('PRIVATE_PROVIDER', 503), host);
		expect(response.status).toHaveBeenCalledWith(503);
		expect(JSON.stringify(response.json.mock.calls)).not.toContain(
			'PRIVATE',
		);
	});
	it('should retain a string message when a controlled HTTP exception supplies it', () => {
		filter.catch(new HttpException('Controlled failure', 400), host);
		expect(response.json).toHaveBeenCalledWith({
			statusCode: 400,
			code: 'VALIDATION_FAILED',
			message: ['Controlled failure'],
			error: 'Bad Request',
		});
	});
	it.each([{ message: [null, 1], error: 1 }, {}])(
		'should return a stable fallback when error metadata is malformed (%p)',
		(body) => {
			filter.catch(new HttpException(body, 400), host);
			expect(response.json).toHaveBeenCalledWith({
				statusCode: 400,
				code: 'VALIDATION_FAILED',
				message: ['Request rejected'],
				error: 'Bad Request',
			});
		},
	);
	it('should keep an explicit catalogued code and ignore an unknown one', () => {
		filter.catch(
			new HttpException(
				{ message: 'Rate exceeded', code: 'RATE_LIMITED' },
				400,
			),
			host,
		);
		expect(response.json).toHaveBeenLastCalledWith(
			expect.objectContaining({ code: 'RATE_LIMITED' }),
		);
		filter.catch(
			new HttpException(
				{ message: 'Odd', code: 'PRIVATE_INTERNAL' },
				400,
			),
			host,
		);
		expect(response.json).toHaveBeenLastCalledWith(
			expect.objectContaining({ code: 'VALIDATION_FAILED' }),
		);
	});
	it('should derive a code for statuses without a catalogue entry', () => {
		filter.catch(new HttpException('Teapot', 418), host);
		expect(response.json).toHaveBeenLastCalledWith(
			expect.objectContaining({ code: 'REQUEST_REJECTED' }),
		);
		filter.catch(new HttpException('Gateway', 502), host);
		expect(response.json).toHaveBeenLastCalledWith(
			expect.objectContaining({ code: 'INTERNAL_ERROR' }),
		);
	});
});
