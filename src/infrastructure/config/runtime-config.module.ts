import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createRuntimeConfigOptions } from './runtime-config.options';

@Module({
	imports: [
		ConfigModule.forRoot(createRuntimeConfigOptions(process.env.NODE_ENV)),
	],
	exports: [ConfigModule],
})
export class RuntimeConfigModule {}
