import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { hashToken } from '@/common/utils/token.util';
import { UserRole } from '@/common/constant/role.constant';
import { authTransaction } from './auth-transaction.util';
import type {
	AccessPrincipal,
	RefreshPrincipal,
	SessionTokens,
	SessionUser,
} from './session.types';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const USER_SELECT = { id: true, name: true, email: true, role: true } as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

@Injectable()
export class AuthSessionService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwt: JwtService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}

	async create(
		userId: string,
		expectedPasswordHash: string,
		role: UserRole,
	): Promise<SessionTokens> {
		// Recheck the password inside a serializable transaction against reset races.
		return authTransaction(this.prisma, async (tx) => {
			const user = await tx.user.findUnique({
				where: { id: userId },
				select: { ...USER_SELECT, password: true },
			});
			if (
				!user ||
				user.password !== expectedPasswordHash ||
				user.role !== (role as string)
			)
				this.deny();
			const sid = randomUUID();
			const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
			const tokens = this.sign(this.publicUser(user), sid, expiresAt);
			await tx.refreshToken.create({
				data: {
					id: sid,
					userId,
					token: hashToken(tokens.refreshToken),
					expiresAt,
				},
			});
			return tokens;
		});
	}

	async validateAccess(payload: unknown): Promise<AccessPrincipal> {
		const claims = this.claims(payload, 'access');
		const session = await this.session(claims.sub, claims.sid);
		if (!session || session.user.role !== claims.role) this.deny();
		return {
			...claims,
			email: session.user.email,
			role: session.user.role,
			type: 'access',
		};
	}

	async validateRefresh(
		payload: unknown,
		rawToken: string,
	): Promise<RefreshPrincipal> {
		const claims = this.claims(payload, 'refresh');
		const session = await this.session(claims.sub, claims.sid);
		if (!session || session.user.role !== claims.role || !rawToken)
			this.deny();
		const tokenHash = hashToken(rawToken);
		if (!this.matchesHash(session.token, tokenHash)) {
			await this.revoke(claims.sub, claims.sid);
			this.deny();
		}
		return {
			...claims,
			email: session.user.email,
			role: session.user.role,
			type: 'refresh',
			tokenHash,
		};
	}

	async rotate(principal: RefreshPrincipal): Promise<SessionTokens> {
		const session = await this.session(principal.sub, principal.sid);
		if (!session || session.user.role !== principal.role) this.deny();
		const tokens = this.sign(
			this.publicUser(session.user),
			principal.sid,
			session.expiresAt,
		);
		// Compare-and-swap: a token can be consumed at most once, including races.
		const updated = await this.prisma.refreshToken.updateMany({
			where: {
				id: principal.sid,
				userId: principal.sub,
				token: principal.tokenHash,
				expiresAt: { gt: new Date() },
			},
			data: { token: hashToken(tokens.refreshToken) },
		});
		if (updated.count !== 1) {
			await this.revoke(principal.sub, principal.sid);
			this.deny();
		}
		return tokens;
	}

	async revoke(userId: string, sid: string): Promise<void> {
		await this.prisma.refreshToken.deleteMany({
			where: { id: sid, userId },
		});
	}

	private session(userId: string, sid: string) {
		return this.prisma.refreshToken.findFirst({
			where: { id: sid, userId, expiresAt: { gt: new Date() } },
			include: { user: { select: USER_SELECT } },
		});
	}

	private claims(payload: unknown, type: 'access' | 'refresh') {
		if (
			!isObject(payload) ||
			payload.type !== type ||
			typeof payload.sub !== 'string' ||
			!payload.sub ||
			typeof payload.sid !== 'string' ||
			!payload.sid ||
			typeof payload.jti !== 'string' ||
			!payload.jti ||
			typeof payload.role !== 'string' ||
			!Object.values(UserRole).includes(payload.role as UserRole)
		)
			this.deny();
		return {
			sub: payload.sub,
			sid: payload.sid,
			jti: payload.jti,
			role: payload.role,
		};
	}

	private sign(
		user: SessionUser,
		sid: string,
		expiresAt: Date,
	): SessionTokens {
		const base = { sub: user.id, sid, role: user.role };
		return {
			accessToken: this.jwt.sign(
				{ ...base, type: 'access', jti: randomUUID() },
				{
					secret: this.config.get('JWT_ACCESS_SECRET', {
						infer: true,
					}),
					algorithm: 'HS256',
					expiresIn: '15m',
				},
			),
			refreshToken: this.jwt.sign(
				{
					...base,
					type: 'refresh',
					jti: randomUUID(),
					exp: Math.floor(expiresAt.getTime() / 1000),
				},
				{
					secret: this.config.get('JWT_REFRESH_SECRET', {
						infer: true,
					}),
					algorithm: 'HS256',
				},
			),
			user,
		};
	}

	private publicUser(user: SessionUser): SessionUser {
		return {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
		};
	}

	private matchesHash(stored: string, presented: string): boolean {
		const left = Buffer.from(stored, 'utf8');
		const right = Buffer.from(presented, 'utf8');
		return left.length === right.length && timingSafeEqual(left, right);
	}

	private deny(): never {
		throw new UnauthorizedException('Invalid or revoked session');
	}
}
