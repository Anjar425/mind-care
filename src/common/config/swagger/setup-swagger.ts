import { INestApplication } from '@nestjs/common';
import {
	DocumentBuilder,
	SwaggerModule,
	type OpenAPIObject,
} from '@nestjs/swagger';
import {
	SWAGGER_INFO,
	SWAGGER_TAGS,
	SWAGGER_BEARER_AUTH,
} from './swagger.config';
import type { RuntimeEnvironment } from '../environment.config';

// Shared by the /docs UI and scripts/generate-openapi.ts (committed docs/openapi.json).
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
	const documentBuilder = new DocumentBuilder()
		.setTitle(SWAGGER_INFO.title)
		.setDescription(SWAGGER_INFO.description)
		.setVersion(SWAGGER_INFO.version);

	SWAGGER_TAGS.forEach(({ name, description }) => {
		documentBuilder.addTag(name, description);
	});

	SWAGGER_BEARER_AUTH.forEach(({ name, description }) => {
		documentBuilder.addBearerAuth(
			{
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				description,
			},
			name,
		);
	});

	return SwaggerModule.createDocument(app, documentBuilder.build());
}

export function setupSwagger(
	app: INestApplication,
	environment: RuntimeEnvironment['NODE_ENV'],
): void {
	if (environment === 'production') return;
	SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
		swaggerOptions: {
			defaultModelsExpandDepth: -1,
			persistAuthorization: false,
		},
	});
}
