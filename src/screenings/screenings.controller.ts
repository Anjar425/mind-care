import {
	Body,
	Controller,
	HttpCode,
	Post,
	Req,
	UseFilters,
	UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessPrincipal } from '../auth/session.types';
import { ScreeningsService } from './screenings.service';
import { OptionalScreeningAuthGuard } from './optional-screening-auth.guard';
import { ScreeningExceptionFilter } from './screening-exception.filter';
import { ScreeningResponseDocumentation } from './screening-api.decorator';
import {
	Dass42ScreeningDto,
	QdssScreeningDto,
} from './dto/screening.requests.dto';
import {
	Dass42ScreeningResponseDto,
	QdssScreeningResponseDto,
} from './dto/screening.responses.dto';
type Request = { user?: AccessPrincipal };
@ApiTags('Public screening')
@Controller('screenings')
@UseGuards(OptionalScreeningAuthGuard)
@UseFilters(ScreeningExceptionFilter)
export class ScreeningsController {
	constructor(private readonly screenings: ScreeningsService) {}
	@Post('qdss')
	@HttpCode(200)
	@ScreeningResponseDocumentation(
		QdssScreeningResponseDto,
		'Screen21 identified DASS21 answers using explicit GLOBAL or eligible GROUP QDSS',
	)
	qdss(@Body() dto: QdssScreeningDto, @Req() req: Request) {
		return this.screenings.evaluateQdss(dto, req.user);
	}
	@Post('dass42')
	@HttpCode(200)
	@ScreeningResponseDocumentation(
		Dass42ScreeningResponseDto,
		'Screen42 identified DASS42 answers with a current conflict-free public group',
	)
	dass42(@Body() dto: Dass42ScreeningDto, @Req() req: Request) {
		return this.screenings.evaluateDass42(dto, req.user);
	}
}
