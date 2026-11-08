import {
	Body,
	Controller,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../domain/identity/identity.types';
import { QdssCalibrationService } from '../../../domain/qdss/qdss-calibration.service';
import { QdssModelService } from '../../../domain/qdss/qdss-model.service';
import {
	EmptyQdssDto,
	QdssDatasetDto,
	QdssPageQuery,
	QdssRunDto,
} from '../../common/dto/qdss/qdss.requests.dto';
import {
	QdssDatasetResponseDto,
	QdssDatasetSavedDto,
	QdssInitializationDto,
	QdssModelResponseDto,
	QdssRunResponseDto,
} from '../../common/dto/qdss/qdss.responses.dto';
import { QdssResponse } from '../../common/dto/qdss/qdss-api.decorator';
type Request = { user: AccessPrincipal };
@ApiTags('QDSS global calibration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/qdss/global')
export class QdssAdminController {
	constructor(
		private readonly calibration: QdssCalibrationService,
		private readonly models: QdssModelService,
	) {}
	@Post('initialize')
	@HttpCode(200)
	@QdssResponse(
		QdssInitializationDto,
		'Explicitly initialize fixed Copy global reference and 20 default samples; D13 applied, no GA',
	)
	initialize(@Req() req: Request, @Body() dto: EmptyQdssDto) {
		void dto;
		return this.calibration.initialize(req.user.sub);
	}
	@Get('calibration')
	@QdssResponse(
		QdssDatasetResponseDto,
		'Read global calibration samples as current ADMIN',
	)
	read(@Req() req: Request, @Query() q: QdssPageQuery) {
		return this.calibration.read(req.user.sub, null, q);
	}
	@Put('calibration')
	@QdssResponse(
		QdssDatasetSavedDto,
		'Replace global calibration with 20–100 complete identified sample sets',
	)
	replace(@Req() req: Request, @Body() dto: QdssDatasetDto) {
		return this.calibration.replace(req.user.sub, null, dto);
	}
	@Post('calibrations')
	@HttpCode(200)
	@QdssResponse(
		QdssRunResponseDto,
		'Run bounded server-side global GA and activate only after source revalidation',
	)
	recalibrate(@Req() req: Request, @Body() dto: QdssRunDto) {
		return this.models.recalibrate(
			req.user.sub,
			null,
			dto.expectedInputHash,
		);
	}
	@Get('model')
	@QdssResponse(
		QdssModelResponseDto,
		'Read current global model readiness and the next calibration input token',
	)
	model(@Req() req: Request) {
		return this.models.read(req.user.sub, null);
	}
	@Get('calibrations/:runId')
	@QdssResponse(QdssRunResponseDto, 'Read safe metadata for a global run')
	run(@Req() req: Request, @Param('runId', ParseUUIDPipe) id: string) {
		return this.models.runDetail(req.user.sub, null, id);
	}
}
