import {
	Body,
	Controller,
	HttpCode,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { ScreeningsService } from '../../../domain/screening/screenings.service';
import { OptionalScreeningAuthGuard } from './optional-screening-auth.guard';
import { ErrorPolicy } from '../../common/errors/error-policy.decorator';
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
@ErrorPolicy('screening')
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
