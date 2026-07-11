import { IsEmail } from 'class-validator';

export class ForgotPasswordReqDto {
	@IsEmail()
	email!: string;
}
