import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor';
import { UserService } from './user/user.service';

@Module({
	imports: [AuthModule, PrismaModule],
	controllers: [AppController],
	providers: [AppService, ResponseInterceptor, UserService],
})
export class AppModule {}
