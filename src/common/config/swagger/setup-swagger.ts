import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
	SWAGGER_INFO,
	SWAGGER_TAGS,
	SWAGGER_BEARER_AUTH,
} from './swagger.config';
import type { RuntimeEnvironment } from '../environment.config';

export function setupSwagger(
	app: INestApplication,
	environment: RuntimeEnvironment['NODE_ENV'],
): void {
	if (environment === 'production') return;
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

	const document = SwaggerModule.createDocument(app, documentBuilder.build());

	SwaggerModule.setup('docs', app, document, {
		swaggerOptions: {
			defaultModelsExpandDepth: -1,
			persistAuthorization: false,
		},
	});
}
