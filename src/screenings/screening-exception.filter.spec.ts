import {
	ArgumentsHost,
	BadRequestException,
	ConflictException,
	Logger,
} from '@nestjs/common';
import { ScreeningExceptionFilter } from './screening-exception.filter';
describe('Sensitive-safe screening errors', () => {
	it.each([
		new BadRequestException('private submitted field'),
		new ConflictException('private rule and author'),
	])('should redact submitted/source details from4xx', (error) => {
		const res = {
			setHeader: jest.fn(),
			status: jest.fn(),
			json: jest.fn(),
		};
		res.status.mockReturnValue(res);
		new ScreeningExceptionFilter().catch(error, {
			switchToHttp: () => ({ getResponse: () => res }),
		} as unknown as ArgumentsHost);
		expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
		expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
	});
	it('should reuse generic5xx logging without raw patient/source content', () => {
		const logger = jest
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		const res = {
			setHeader: jest.fn(),
			status: jest.fn(),
			json: jest.fn(),
		};
		res.status.mockReturnValue(res);
		new ScreeningExceptionFilter().catch(new Error('private answer'), {
			switchToHttp: () => ({ getResponse: () => res }),
		} as unknown as ArgumentsHost);
		expect(logger).toHaveBeenCalledWith('API request failed');
		expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
		logger.mockRestore();
	});
});
