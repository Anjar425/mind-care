import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor';
import { HttpExceptionFilter } from './common/filter/http-exception/http-exception.filter';
import { setupSwagger } from './common/config/swagger/setup-swagger';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useGlobalInterceptors(app.get(ResponseInterceptor));
	app.useGlobalFilters(new HttpExceptionFilter());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
		}),
	);

	setupSwagger(app);
	await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
