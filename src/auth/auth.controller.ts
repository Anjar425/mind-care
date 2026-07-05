import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-user.dto';
import { Response } from '@/common/decorator/response/response.decorator';
import { UserRole } from '@/user/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('/user/register')
	@Response('User Created Successfully')
	userRegister(@Body() dto: RegisterDto) {
		return this.authService.register(dto, UserRole.USER);
	}

	@Post('/expert/register')
	@Response('User Created Successfully')
	expertRegister(@Body() dto: RegisterDto) {
		return this.authService.register(dto, UserRole.EXPERT);
	}

	@Post('/login')
	@Response('Login successful')
	login(@Body() dto: LoginDto) {
		return this.authService.login(dto);
	}

	@Post('/refresh')
	@UseGuards(RefreshAuthGuard)
	@Response('Token refreshed successfully')
	refresh(@Req() req: any) {
		return this.authService.refresh(req.user);
	}

	@Post('/logout')
	@UseGuards(JwtAuthGuard)
	@Response('Logout successful')
	logout(@Req() req: any) {
		return this.authService.logout(req.user.sub);
	}
}
