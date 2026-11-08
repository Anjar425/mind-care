import {
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
@Injectable()
export class OptionalScreeningAuthGuard extends JwtAuthGuard {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<{
			headers: { authorization?: string };
			rawHeaders?: string[];
			user?: AccessPrincipal;
		}>();
		if (!Object.hasOwn(req.headers, 'authorization')) {
			delete req.user;
			return true;
		}
		const duplicates = (req.rawHeaders ?? []).filter(
			(value, i) =>
				i % 2 === 0 && value.toLowerCase() === 'authorization',
		).length;
		if (
			duplicates > 1 ||
			typeof req.headers.authorization !== 'string' ||
			!/^Bearer [^\s,]+$/i.test(req.headers.authorization)
		)
			throw new UnauthorizedException();
		const allowed = await super.canActivate(context);
		if (!allowed || !req.user) throw new UnauthorizedException();
		if (!['USER', 'EXPERT'].includes(req.user.role))
			throw new ForbiddenException();
		return true;
	}
}
