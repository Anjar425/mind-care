import 'reflect-metadata';
import { MessageResponse } from './message-response.decorator';

describe('MessageResponse', () => {
	afterEach(() => jest.clearAllMocks());
	it('should store a scalar string when response metadata is declared', () => {
		class Example {
			@MessageResponse('Created') method(this: void) {}
		}
		const metadata: unknown = Reflect.getMetadata(
			'response_message',
			Example.prototype.method,
		);
		expect(metadata).toBe('Created');
	});
});
