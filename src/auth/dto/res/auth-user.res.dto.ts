import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@/common/constant/role.constant';

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

export class RegisteredAuthUserResDto extends AuthUserResDto {
	@ApiProperty({
		description: 'Account creation time',
		type: String,
		format: 'date-time',
		example: '2026-01-01T00:00:00.000Z',
	})
	created_at!: Date;
}
