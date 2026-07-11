import { IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordReqDto {
	@IsNotEmpty()
	token!: string;

	@IsNotEmpty()
	@MinLength(6)
	newPassword!: string;
}
