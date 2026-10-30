import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_METADATA } from '../decorators/roles.decorator';
import type { AccessPrincipal } from '../session.types';

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}
	canActivate(context: ExecutionContext): boolean {
		const roles = this.reflector.getAllAndOverride<string[]>(
			ROLE_METADATA,
			[context.getHandler(), context.getClass()],
		);
		const request = context
			.switchToHttp()
			.getRequest<{ user?: AccessPrincipal }>();
		if (
			!roles?.length ||
			!request.user ||
			!roles.includes(request.user.role)
		)
			throw new ForbiddenException('Role is not permitted');
		return true;
	}
}
