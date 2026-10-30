import { SetMetadata } from '@nestjs/common';

export const MessageResponse = (message: string) =>
	SetMetadata('response_message', message);
