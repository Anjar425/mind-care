import { applyDecorators, BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsByteLength, IsString, Matches, MinLength } from 'class-validator';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function NormalizeEmail(): PropertyDecorator {
	return Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? normalizeEmail(value) : value,
	);
}

export function PasswordPolicy(): PropertyDecorator {
	return applyDecorators(
		IsString(),
		MinLength(8),
		IsByteLength(0, 72, {
			message: 'password must not exceed 72 UTF-8 bytes',
		}),
		Matches(PASSWORD_PATTERN, {
			message: 'password must contain uppercase, lowercase, and number',
		}),
	);
}

export function assertPassword(password: string): void {
	if (
		typeof password !== 'string' ||
		Array.from(password).length < 8 ||
		Buffer.byteLength(password, 'utf8') > 72 ||
		!PASSWORD_PATTERN.test(password)
	) {
		throw new BadRequestException(
			'Password must have at least 8 characters, uppercase, lowercase and a number, and at most 72 UTF-8 bytes',
		);
	}
}

export function assertOpaqueToken(token: string): void {
	if (typeof token !== 'string' || !/^[a-fA-F0-9]{64}$/.test(token)) {
		throw new BadRequestException('Invalid or expired token');
	}
}
