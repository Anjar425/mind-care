import {
	Body,
	Controller,
	Post,
	Req,
	UseGuards,
	Get,
	Query,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';

import { MessageResponse } from '@/common/decorator/api/message-response.decorator';
import { ApiCommonResponse } from '@/common/decorator/api/api-common-response.decorator';

import { UserRole } from '@/common/constant/role.constant';
import { RegisterResDto } from './dto/res/register.res.dto';
import { RegisterReqDto } from './dto/req/register.req.dto';
import { LoginResDto } from './dto/res/login.res.dto';
import { LoginReqDto } from './dto/req/login.req.dto';
import { EmailVerificationReqDto } from './dto/req/email-verification.req.dto';
import { ForgotPasswordReqDto } from './dto/req/forgot-password.req.dto';
import { ResetPasswordReqDto } from './dto/req/reset-password.req.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('/user/register')
	@MessageResponse('User Created Successfully')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Register new user',
		description:
			'Creates a new user account with USER role using email, name, and password. Email verification may be required before accessing protected resources.',
	})
	@ApiCommonResponse([201, 400, 409, 500], {
		model: RegisterResDto,
	})
	userRegister(@Body() dto: RegisterReqDto) {
		return this.authService.register(dto, UserRole.USER);
	}

	@Post('/expert/register')
	@MessageResponse('Expert Created Successfully')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Register new expert user',
		description:
			'Creates a new expert account with EXPERT role using email, name, and password. Expert accounts may require additional verification before use.',
	})
	@ApiCommonResponse([201, 400, 409, 500], {
		model: RegisterResDto,
	})
	expertRegister(@Body() dto: RegisterReqDto) {
		return this.authService.register(dto, UserRole.EXPERT);
	}

	@Post('/login')
	@MessageResponse('Login successful')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'User login',
		description:
			'Authenticates a user using email and password, then returns an access token and refresh token.',
	})
	@ApiCommonResponse([200, 400, 401, 500], {
		model: LoginResDto,
	})
	login(@Body() dto: LoginReqDto) {
		return this.authService.login(dto);
	}

	@Post('/refresh')
	@UseGuards(RefreshAuthGuard)
	@ApiBearerAuth('refresh-token')
	@MessageResponse('Token refreshed successfully')
	@ApiOperation({
		summary: 'Refresh access token',
		description:
			'Generates a new access token using a valid refresh token.',
	})
	@ApiCommonResponse([200, 401, 500])
	refresh(@Req() req: any) {
		return this.authService.refresh(req.user);
	}

	@Post('/logout')
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('access-token')
	@MessageResponse('Logout successful')
	@ApiOperation({
		summary: 'User logout',
		description:
			'Invalidates the current user session and logs the user out.',
	})
	@ApiCommonResponse([200, 401, 500])
	logout(@Req() req: any) {
		return this.authService.logout(req.user.sub);
	}

	@Post('/send-verification')
	@MessageResponse('Verification email sent')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Send email verification',
		description:
			'Sends a verification email containing a verification link to the user email address.',
	})
	@ApiCommonResponse([200, 400, 500])
	sendVerification(@Body() dto: EmailVerificationReqDto) {
		return this.authService.sendVerificationEmail(dto.email);
	}

	@Get('/verify')
	@MessageResponse('Email verified successfully')
	@ApiOperation({
		summary: 'Verify user email',
		description:
			'Verifies a user email address using the verification token provided in the query parameter.',
	})
	@ApiCommonResponse([200, 400, 404, 500])
	verifyAccount(@Query('token') token: string) {
		return this.authService.verifyAccount(token);
	}

	@Post('/forgot-password')
	@MessageResponse('Password reset email sent')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Request password reset',
		description:
			'Sends a password reset email containing a reset token to the user email address.',
	})
	@ApiCommonResponse([200, 400, 404, 500])
	forgotPassword(@Body() dto: ForgotPasswordReqDto) {
		return this.authService.forgotPassword(dto.email);
	}

	@Post('/reset-password')
	@MessageResponse('Password reset successfully')
	@ApiOperation({
		summary: 'Reset user password',
		description:
			'Updates the user password using a valid password reset token.',
	})
	@ApiCommonResponse([200, 400, 401, 500])
	resetPassword(@Body() dto: ResetPasswordReqDto) {
		return this.authService.resetPassword(dto.token, dto.newPassword);
	}
}