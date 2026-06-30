import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response_message';

export const Response = (message: string) => SetMetadata(RESPONSE_MESSAGE, message);
