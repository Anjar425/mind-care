import { HttpStatus } from '@nestjs/common';

export const DEFAULT_MESSAGE: Record<
	number,
	{ message: string; error?: string }
> = {
	[HttpStatus.OK]: {
		message: 'Success',
	},
	[HttpStatus.CREATED]: {
		message: 'Created Successfully',
	},
	[HttpStatus.BAD_REQUEST]: {
		message: 'Validation Error',
		error: 'Bad Request',
	},
	[HttpStatus.UNAUTHORIZED]: {
		message: 'Unauthorized',
		error: 'Unauthorized',
	},
	[HttpStatus.FORBIDDEN]: {
		message: 'Forbidden',
		error: 'Forbidden',
	},
	[HttpStatus.NOT_FOUND]: {
		message: 'Data not found',
		error: 'Not Found',
	},
	[HttpStatus.CONFLICT]: {
		message: 'Data already exists',
		error: 'Conflict',
	},
	[HttpStatus.INTERNAL_SERVER_ERROR]: {
		message: 'Internal Server Error',
		error: 'Internal Server Error',
	},
	[HttpStatus.TOO_MANY_REQUESTS]: {
		message: 'Too many requests',
		error: 'Too Many Requests',
	},
	[HttpStatus.SERVICE_UNAVAILABLE]: {
		message: 'Internal server error',
		error: 'Service Unavailable',
	},
};
