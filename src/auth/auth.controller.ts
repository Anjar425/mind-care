import {
	Body,
	Controller,
	Post,
	Req,
	UseGuards,
	Get,
	Query,
	HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-user.dto';
import { CreateUserDto, UserRole } from '@/user/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { SendVerificationDto } from './dto/send-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { MessageResponse } from '@/common/decorator/message-response.decorator';
import { ApiCommonResponse } from '@/common/decorator/api-common-response.decorator';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('/user/register')
	@MessageResponse('User Created Successfully')
	userRegister(@Body() dto: RegisterDto) {
		return this.authService.register(dto, UserRole.USER);
	}

	@Post('/expert/register')
	@MessageResponse('User Created Successfully')
	expertRegister(@Body() dto: RegisterDto) {
		return this.authService.register(dto, UserRole.EXPERT);
	}

	@Post('/login')
	@MessageResponse('Login successful')
	login(@Body() dto: LoginDto) {
		return this.authService.login(dto);
	}

	@Post('/refresh')
	@UseGuards(RefreshAuthGuard)
	@MessageResponse('Token refreshed successfully')
	refresh(@Req() req: any) {
		return this.authService.refresh(req.user);
	}

	@Post('/logout')
	@UseGuards(JwtAuthGuard)
	@MessageResponse('Logout successful')
	logout(@Req() req: any) {
		return this.authService.logout(req.user.sub);
	}

	@Post('/send-verification')
	@MessageResponse('Verification email sent')
	@HttpCode(200)
	sendVerification(@Body() dto: SendVerificationDto) {
		return this.authService.sendVerificationEmail(dto.email);
	}

	@Get('/verify')
	@MessageResponse('Email verified successfully')
	verifyAccount(@Query('token') token: string) {
		return this.authService.verifyAccount(token);
	}

	@Post('/forgot-password')
	@MessageResponse('Password reset email sent')
	@HttpCode(200)
	forgotPassword(@Body() dto: ForgotPasswordDto) {
		return this.authService.forgotPassword(dto.email);
	}

	@Post('/reset-password')
	@MessageResponse('Password reset successfully')
	resetPassword(@Body() dto: ResetPasswordDto) {
		return this.authService.resetPassword(dto.token, dto.newPassword);
	}
}
