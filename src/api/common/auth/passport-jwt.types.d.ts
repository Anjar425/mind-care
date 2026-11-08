// Only the existing dependency's API used by auth is declared here.
// Verified against passport-jwt/lib/strategy.js and extract_jwt.js.
declare module 'passport-jwt' {
	import type { Request } from 'express';

	export interface StrategyOptions {
		jwtFromRequest: (request: Request) => string | null;
		secretOrKey?: string | Buffer;
		algorithms?: string[];
		ignoreExpiration?: boolean;
		passReqToCallback?: boolean;
	}

	export class Strategy {
		constructor(
			options: StrategyOptions,
			verify: (...args: unknown[]) => void,
		);
		name: string;
		authenticate(request: Request, options?: unknown): void;
	}

	export const ExtractJwt: {
		fromAuthHeaderAsBearerToken(): (request: Request) => string | null;
	};
}
