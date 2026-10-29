import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
	Req,
	UseFilters,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@/common/constant/role.constant';
import { AuthService } from './auth.service';
import { AuthApiResponse } from './auth-api-response.decorator';
import { AuthExceptionFilter } from './auth-exception.filter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { RegisterReqDto } from './dto/req/register.req.dto';
import { LoginReqDto } from './dto/req/login.req.dto';
import { EmailVerificationReqDto } from './dto/req/email-verification.req.dto';
import { ForgotPasswordReqDto } from './dto/req/forgot-password.req.dto';
import { ResetPasswordReqDto } from './dto/req/reset-password.req.dto';
import { VerifyAccountReqDto } from './dto/req/verify-account.req.dto';
import { RegisterResDto } from './dto/res/register.res.dto';
import { LoginResDto } from './dto/res/login.res.dto';
import { AuthMessageResDto } from './dto/res/auth-response.dto';
import type { AccessPrincipal, RefreshPrincipal } from './session.types';

@ApiTags('Auth')
@UseFilters(AuthExceptionFilter)
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('/user/register')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Register an ordinary user' })
	@AuthApiResponse(
		201,
		'User created successfully',
		RegisterResDto,
		[400, 409, 500],
	)
	userRegister(@Body() dto: RegisterReqDto) {
		return this.authService.register(dto, UserRole.USER);
	}

	@Post('/expert/register')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Register an expert account',
		description:
			'Credential approval and calculation eligibility are separate from account registration.',
	})
	@AuthApiResponse(
		201,
		'Expert account created successfully',
		RegisterResDto,
		[400, 409, 500],
	)
	expertRegister(@Body() dto: RegisterReqDto) {
		return this.authService.register(dto, UserRole.EXPERT);
	}

	@Post('/login')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Sign in an ordinary user',
		description:
			'Accepts USER accounts only. Legacy tokens without a session identity require a new sign-in.',
	})
	@AuthApiResponse(200, 'Login successful', LoginResDto, [400, 401, 409, 500])
	login(@Body() dto: LoginReqDto) {
		return this.authService.login(dto, UserRole.USER);
	}

	@Post('/expert/login')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Sign in an expert account',
		description:
			'Accepts EXPERT accounts only; sign-in does not approve professional credentials.',
	})
	@AuthApiResponse(200, 'Login successful', LoginResDto, [400, 401, 409, 500])
	expertLogin(@Body() dto: LoginReqDto) {
		return this.authService.login(dto, UserRole.EXPERT);
	}

	@Post('/admin/login')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Sign in an existing administrator',
		description:
			'Accepts ADMIN accounts only. No public administrator registration is provided.',
	})
	@AuthApiResponse(200, 'Login successful', LoginResDto, [400, 401, 409, 500])
	adminLogin(@Body() dto: LoginReqDto) {
		return this.authService.login(dto, UserRole.ADMIN);
	}

	@Post('/refresh')
	@HttpCode(HttpStatus.OK)
	@UseGuards(RefreshAuthGuard)
	@ApiBearerAuth('refresh-token')
	@ApiOperation({
		summary: 'Rotate the current session tokens',
		description:
			'Replace both tokens with this response. Reusing a consumed refresh token revokes its session.',
	})
	@AuthApiResponse(
		200,
		'Tokens refreshed successfully',
		LoginResDto,
		[401, 500],
	)
	refresh(@Req() req: { user: RefreshPrincipal }) {
		return this.authService.refresh(req.user);
	}

	@Post('/logout')
	@HttpCode(HttpStatus.OK)
	@UseGuards(JwtAuthGuard)
	@ApiBearerAuth('access-token')
	@ApiOperation({
		summary: 'Revoke only the current session',
		description:
			'Access and refresh credentials for this session are rejected afterward; other sessions remain active.',
	})
	@AuthApiResponse(200, 'Logout successful', AuthMessageResDto, [401, 500])
	logout(@Req() req: { user: AccessPrincipal }) {
		return this.authService.logout(req.user);
	}

	@Post('/send-verification')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Request an email verification link' })
	@AuthApiResponse(
		200,
		'If the account is eligible, a verification link will be sent',
	)
	sendVerification(@Body() dto: EmailVerificationReqDto) {
		return this.authService.sendVerificationEmail(dto.email);
	}

	@Get('/verify')
	@ApiOperation({
		summary: 'Verify an account email with a single-use token',
	})
	@AuthApiResponse(
		200,
		'Email verified successfully',
		undefined,
		[400, 409, 500],
	)
	verifyAccount(@Query() dto: VerifyAccountReqDto) {
		return this.authService.verifyAccount(dto.token);
	}

	@Post('/forgot-password')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Request a password reset link',
		description:
			'The response does not disclose whether an account exists.',
	})
	@AuthApiResponse(
		200,
		'If the account is eligible, a password reset link will be sent',
	)
	forgotPassword(@Body() dto: ForgotPasswordReqDto) {
		return this.authService.forgotPassword(dto.email);
	}

	@Post('/reset-password')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Reset the password and revoke every session',
		description:
			'Uses the registration password policy and consumes the reset token once. All previous access and refresh sessions are rejected.',
	})
	@AuthApiResponse(
		200,
		'Password reset successfully',
		AuthMessageResDto,
		[400, 409, 500],
	)
	resetPassword(@Body() dto: ResetPasswordReqDto) {
		return this.authService.resetPassword(dto.token, dto.newPassword);
	}
}
