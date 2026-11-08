import 'reflect-metadata';
import { HistoryResponse } from './history-api.decorator';
import { HistorySavedDto } from './dto/history.responses.dto';
describe('Typed history response documentation', () => {
	it('should document actual creation/retry and all relevant safe error statuses', () => {
		class Example {
			method(this: void) {}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Example.prototype,
			'method',
		)!;
		HistoryResponse(
			HistorySavedDto,
			'Synthetic save',
			false,
			true,
		)(Example.prototype, 'method', descriptor);
		const responses = Reflect.getMetadata(
			'swagger/apiResponse',
			Example.prototype.method,
		) as Record<string, unknown>;
		expect(Object.keys(responses)).toEqual(
			expect.arrayContaining([
				'200',
				'201',
				'400',
				'401',
				'403',
				'404',
				'409',
				'413',
				'429',
				'500',
				'503',
			]),
		);
	});
});
