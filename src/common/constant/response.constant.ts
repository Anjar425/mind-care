import { HttpStatus } from '@nestjs/common';

export const DEFAULT_RESPONSE_MESSAGES: Record<number, string> = {
    [HttpStatus.OK]: 'Success',
    [HttpStatus.CREATED]: 'Resource created successfully',
    [HttpStatus.ACCEPTED]: 'Request accepted',

    [HttpStatus.BAD_REQUEST]: 'Bad request',
    [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpStatus.PAYMENT_REQUIRED]: 'Payment required',
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'Resource not found',
    [HttpStatus.METHOD_NOT_ALLOWED]: 'Method not allowed',
    [HttpStatus.NOT_ACCEPTABLE]: 'Not acceptable',
    [HttpStatus.REQUEST_TIMEOUT]: 'Request timeout',
    [HttpStatus.CONFLICT]: 'Conflict occurred',
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported media type',
    [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',

    [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal server error',
    [HttpStatus.BAD_GATEWAY]: 'Bad gateway',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'Service unavailable',
    [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway timeout',
};