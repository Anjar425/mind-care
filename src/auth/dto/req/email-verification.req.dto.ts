import { IsEmail } from 'class-validator';

export class EmailVerificationReqDto {
	@IsEmail()
	email!: string;
}
