import { UserRole } from '../../shared/types/role';

const SELF_REGISTERED: ReadonlySet<string> = new Set<string>([
	UserRole.USER,
	UserRole.EXPERT,
]);

/**
 * Self-registered roles must verify their email before they can hold a session. Administrators
 * have no public registration; operators provision them, so they are not gated here.
 */
export function requiresVerifiedEmail(role: string): boolean {
	return SELF_REGISTERED.has(role);
}
