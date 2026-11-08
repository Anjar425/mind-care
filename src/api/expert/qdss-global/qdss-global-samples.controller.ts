import { Body, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { QdssCalibrationService } from '../../../domain/qdss/qdss-calibration.service';
import { QdssPageQuery } from '../../common/dto/qdss/qdss.requests.dto';
import { QdssDatasetResponseDto } from '../../common/dto/qdss/qdss.responses.dto';
import { QdssResponse } from '../../common/dto/qdss/qdss-api.decorator';
type Request = { user: AccessPrincipal };
@ApiTags('QDSS shared global samples')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/qdss/global')
export class QdssGlobalSamplesController {
	constructor(private readonly calibration: QdssCalibrationService) {}
	@Get('calibration')
	@QdssResponse(
		QdssDatasetResponseDto,
		'Read global samples as an active member of a nonarchived group',
	)
	read(@Req() req: Request, @Query() q: QdssPageQuery) {
		return this.calibration.read(req.user.sub, null, q);
	}
}
