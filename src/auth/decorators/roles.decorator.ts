import { SetMetadata } from '@nestjs/common';
import type { ROLE } from '../../prisma/generated/client';

export const ROLE_METADATA = 'allowed_roles';
export const Roles = (...roles: ROLE[]) => SetMetadata(ROLE_METADATA, roles);
