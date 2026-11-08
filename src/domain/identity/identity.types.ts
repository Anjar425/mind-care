import type { UserRole } from '../../shared/types/role';

// Inputs accepted by the identity domain. HTTP DTOs implement these shapes.
export interface RegisterInput {
	email: string;
	name: string;
	password: string;
	confirm_password: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface CreateUserInput {
	email: string;
	name: string;
	password: string;
	role: UserRole;
	email_verified_at?: string;
}

export interface UpdateUserInput {
	email?: string;
	name?: string;
}

// Session and token principals.
export interface SessionUser {
	id: string;
	name: string;
	email: string;
	role: string;
}

export interface AccessPrincipal {
	sub: string;
	sid: string;
	jti: string;
	email: string;
	role: string;
	type: 'access';
}

export interface RefreshPrincipal extends Omit<AccessPrincipal, 'type'> {
	type: 'refresh';
	tokenHash: string;
}

export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
	user: SessionUser;
}
