import 'reflect-metadata';
import { ScreeningResponseDocumentation } from './screening-api.decorator';
import { QdssScreeningResponseDto } from './dto/screening.responses.dto';
describe('Optional-auth typed screening documentation', () => {
	it('should document anonymous OR the existing named access-token scheme, explicit200 and safe failures', () => {
		class Example {
			handler(this: void) {}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Example.prototype,
			'handler',
		)!;
		ScreeningResponseDocumentation(
			QdssScreeningResponseDto,
			'Synthetic screening',
		)(Example.prototype, 'handler', descriptor);
		const operation = Reflect.getMetadata(
			'swagger/apiOperation',
			Example.prototype.handler,
		) as { security: unknown };
		const responses = Reflect.getMetadata(
			'swagger/apiResponse',
			Example.prototype.handler,
		) as Record<string, unknown>;
		expect(operation.security).toEqual([{}, { 'access-token': [] }]);
		expect(responses).toHaveProperty('200');
		expect(responses).not.toHaveProperty('201');
		expect(responses).toHaveProperty('415');
	});
});
