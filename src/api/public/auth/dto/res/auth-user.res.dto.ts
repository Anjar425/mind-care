import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@/shared/types/role';

export class AuthUserResDto {
	@ApiProperty({
		description: 'Account identifier',
		example: '00000000-0000-4000-8000-000000000001',
	})
	id!: string;
	@ApiProperty({
		description: 'Registered account name',
		example: 'Example User',
	})
	name!: string;
	@ApiProperty({
		description: 'Account email identity',
		example: 'user@example.com',
	})
	email!: string;
	@ApiProperty({
		description: 'Account role; EXPERT does not imply credential approval',
		enum: UserRole,
		example: UserRole.USER,
	})
	role!: UserRole;
}
