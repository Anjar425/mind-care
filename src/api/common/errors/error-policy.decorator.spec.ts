import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { ErrorPolicy } from './error-policy.decorator';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('ErrorPolicy', () => {
	it('should bind one controller-scoped GlobalExceptionFilter carrying the policy', () => {
		@ErrorPolicy('history')
		class HistoryRoute {}
		const filters = Reflect.getMetadata(
			EXCEPTION_FILTERS_METADATA,
			HistoryRoute,
		) as unknown[];
		expect(filters).toHaveLength(1);
		expect(filters[0]).toBeInstanceOf(GlobalExceptionFilter);
		expect(filters[0]).toHaveProperty('policy', 'history');
	});
});
