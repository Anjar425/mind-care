import type { ConfigModuleOptions } from '@nestjs/config';
import { validateEnvironment } from './environment.config';

export function createRuntimeConfigOptions(
	environment: string | undefined,
): ConfigModuleOptions {
	return {
		isGlobal: true,
		envFilePath: '.env',
		ignoreEnvFile: environment === 'test' || environment === 'production',
		skipProcessEnv: true,
		validate: validateEnvironment,
	};
}
