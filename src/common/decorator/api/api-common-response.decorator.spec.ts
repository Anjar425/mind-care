import 'reflect-metadata';
import { ApiCommonResponse } from './api-common-response.decorator';
class ExampleDto {
	id!: string;
}
function documentation(
	decorator: MethodDecorator,
): Record<string, { schema?: unknown; description?: string }> {
	class Example {
		method(this: void) {}
	}
	decorator(
		Example.prototype,
		'method',
		Object.getOwnPropertyDescriptor(Example.prototype, 'method')!,
	);
	return Reflect.getMetadata(
		'swagger/apiResponse',
		Example.prototype.method,
	) as Record<string, { schema?: unknown; description?: string }>;
}
describe('ApiCommonResponse', () => {
	afterEach(() => jest.clearAllMocks());
	it('should describe scalar success and array error messages when response codes differ', () => {
		const docs = documentation(
			ApiCommonResponse([200, 201, 400, 401, 403, 404, 409, 500]),
		);
		for (const status of [200, 201])
			expect(docs[status].schema).toMatchObject({
				allOf: [
					{},
					{
						properties: {
							message: { type: 'string' },
							statusCode: { example: status },
						},
					},
				],
			});
		for (const status of [400, 401, 403, 404, 409, 500])
			expect(docs[status].schema).toMatchObject({
				allOf: [
					{},
					{
						properties: {
							message: {
								type: 'array',
								items: { type: 'string' },
							},
							statusCode: { example: status },
						},
					},
				],
			});
	});
	it('should omit a body schema when status is 204', () =>
		expect(
			documentation(ApiCommonResponse([204]))[204].schema,
		).toBeUndefined());
	it('should reference array item DTOs when a list response is documented', () => {
		expect(
			documentation(
				ApiCommonResponse([200], { model: ExampleDto, isArray: true }),
			)[200].schema,
		).toMatchObject({
			allOf: [
				{},
				{},
				{
					required: ['data'],
					properties: {
						data: {
							type: 'array',
							items: { $ref: '#/components/schemas/ExampleDto' },
						},
					},
				},
			],
		});
	});
	it('should reference a DTO when an object response is documented', () => {
		expect(
			documentation(ApiCommonResponse([200], { model: ExampleDto }))[200]
				.schema,
		).toMatchObject({
			allOf: [
				{},
				{},
				{
					properties: {
						data: { $ref: '#/components/schemas/ExampleDto' },
					},
				},
			],
		});
	});
	it('should apply explicit examples when a message override is supplied', () => {
		expect(
			documentation(
				ApiCommonResponse([200], {
					withData: true,
					overrides: { 200: { message: 'Listed' } },
				}),
			)[200],
		).toMatchObject({
			description: 'Listed',
			schema: {
				allOf: [
					{},
					{ properties: { message: { example: 'Listed' } } },
					{ properties: { data: { type: 'object' } } },
				],
			},
		});
	});
});
