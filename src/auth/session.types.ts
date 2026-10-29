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
