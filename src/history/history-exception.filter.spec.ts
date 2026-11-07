import {
	ArgumentsHost,
	BadRequestException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { HistoryExceptionFilter } from './history-exception.filter';
describe('Private history error redaction', () => {
	it('should redact field/value/URL details even for validation failures', () => {
		const response = {
			setHeader: jest.fn(),
			status: jest.fn(),
			json: jest.fn(),
		};
		response.status.mockReturnValue(response);
		const host = {
			switchToHttp: () => ({ getResponse: () => response }),
		} as unknown as ArgumentsHost;
		new HistoryExceptionFilter().catch(
			new BadRequestException('sensitive patient field-name'),
			host,
		);
		expect(JSON.stringify(response.json.mock.calls)).not.toContain(
			'sensitive',
		);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Cache-Control',
			'no-store',
		);
		new HistoryExceptionFilter().catch(new UnauthorizedException(), host);
		expect(response.setHeader).toHaveBeenCalledWith(
			'WWW-Authenticate',
			'Bearer',
		);
	});
	it('should preserve generic safe500 logging without the underlying payload', () => {
		const logger = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const response = {
			setHeader: jest.fn(),
			status: jest.fn(),
			json: jest.fn(),
		};
		response.status.mockReturnValue(response);
		new HistoryExceptionFilter().catch(new Error('private answer'), {
			switchToHttp: () => ({ getResponse: () => response }),
		} as unknown as ArgumentsHost);
		expect(logger).toHaveBeenCalledWith('API request failed');
		expect(JSON.stringify(response.json.mock.calls)).not.toContain(
			'private answer',
		);
		logger.mockRestore();
	});
});
