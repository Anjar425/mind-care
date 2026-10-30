import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { setupSwagger } from './setup-swagger';

describe('setupSwagger', () => {
	afterEach(() => jest.restoreAllMocks());
	it('should avoid registering all documentation routes when production is selected', () => {
		const create = jest.spyOn(SwaggerModule, 'createDocument');
		const setup = jest.spyOn(SwaggerModule, 'setup');
		setupSwagger({} as INestApplication, 'production');
		expect(create).not.toHaveBeenCalled();
		expect(setup).not.toHaveBeenCalled();
	});
});
