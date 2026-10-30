import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessPrincipal } from '../session.types';

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
				select: { role: true, email_verified_at: true },
			}));
		if (!current || current.role !== 'EXPERT' || !current.email_verified_at)
			throw new ForbiddenException(
				'Verify your expert email before submitting',
			);
		return true;
	}
}
