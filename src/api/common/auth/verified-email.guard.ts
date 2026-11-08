import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
	constructor(private readonly prisma: PrismaService) {}
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const { user } = context
			.switchToHttp()
			.getRequest<{ user?: AccessPrincipal }>();
		const current =
			user &&
			(await this.prisma.user.findUnique({
				where: { id: user.sub },
				select: { role: true, emailVerifiedAt: true },
			}));
		if (!current || current.role !== 'EXPERT' || !current.emailVerifiedAt)
			throw new ForbiddenException(
				'Verify your expert email before submitting',
			);
		return true;
	}
}
