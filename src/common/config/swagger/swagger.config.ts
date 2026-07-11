export interface SwaggerTagConfig {
	name: string;
	description: string;
}

export interface SwaggerBearerConfig {
	name: string; 
	description?: string;
}

export const SWAGGER_INFO = {
	title: 'Mind Care API',
	description: 'API Documentation for Mind Care',
	version: '1.0.0',
} as const;

export const SWAGGER_TAGS: SwaggerTagConfig[] = [
	{ name: 'Auth', description: 'Authentication and account management endpoints' },
];

export const SWAGGER_BEARER_AUTH: SwaggerBearerConfig[] = [
	{ name: 'access-token', description: 'JWT access token' },
	{ name: 'refresh-token', description: 'JWT refresh token' },
];