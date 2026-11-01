import {
	applyDecorators,
	Body,
	Controller,
	Get,
	Header,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
	UseGuards,
	type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessPrincipal } from '../auth/session.types';
import { RuleIdPipe } from '../rules/rule-id.pipe';
import { QdssCalibrationService } from './qdss-calibration.service';
import { QdssModelService } from './qdss-model.service';
import {
	EmptyQdssDto,
	QdssDatasetDto,
	QdssPageQuery,
	QdssRunDto,
} from './dto/qdss.requests.dto';
import {
	QdssDatasetResponseDto,
	QdssDatasetSavedDto,
	QdssInitializationDto,
	QdssModelResponseDto,
	QdssRunResponseDto,
} from './dto/qdss.responses.dto';
const Response = (model: Type<unknown>, summary: string) =>
	applyDecorators(
		Header('Cache-Control', 'no-store'),
		ApiOperation({
			summary,
			description:
				'Private QDSS model governance. Samples are server-readable; no operator-confidentiality guarantee. Calibration does not read or store personal screening histories. More than 20 samples allowed, local resource cap 100 complete sets.',
		}),
		ApiCommonResponse([200, 400, 401, 403, 404, 409, 413, 429, 500, 503], {
			model,
		}),
	);
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
	@Response(
		QdssInitializationDto,
		'Explicitly initialize fixed Copy global reference and 20 default samples; D13 applied, no GA',
	)
	initialize(@Req() req: Request, @Body() dto: EmptyQdssDto) {
		void dto;
		return this.calibration.initialize(req.user.sub);
	}
	@Get('calibration')
	@Response(
		QdssDatasetResponseDto,
		'Read global calibration samples as current ADMIN',
	)
	read(@Req() req: Request, @Query() q: QdssPageQuery) {
		return this.calibration.read(req.user.sub, null, q);
	}
	@Put('calibration')
	@Response(
		QdssDatasetSavedDto,
		'Replace global calibration with 20–100 complete identified sample sets',
	)
	replace(@Req() req: Request, @Body() dto: QdssDatasetDto) {
		return this.calibration.replace(req.user.sub, null, dto);
	}
	@Post('calibrations')
	@HttpCode(200)
	@Response(
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
	@Response(
		QdssModelResponseDto,
		'Read current global model readiness and the next calibration input token',
	)
	model(@Req() req: Request) {
		return this.models.read(req.user.sub, null);
	}
	@Get('calibrations/:runId')
	@Response(QdssRunResponseDto, 'Read safe metadata for a global run')
	run(@Req() req: Request, @Param('runId', ParseUUIDPipe) id: string) {
		return this.models.runDetail(req.user.sub, null, id);
	}
}
@ApiTags('QDSS group calibration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/groups/:groupId/qdss')
export class QdssGroupController {
	constructor(
		private readonly calibration: QdssCalibrationService,
		private readonly models: QdssModelService,
	) {}
	@Get('calibration')
	@Response(
		QdssDatasetResponseDto,
		'Read own-group or inherited global samples as a current active member',
	)
	read(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Query() q: QdssPageQuery,
	) {
		return this.calibration.read(req.user.sub, groupId, q);
	}
	@Put('calibration')
	@Response(
		QdssDatasetSavedDto,
		'Leader replaces own-group dataset; current valid credentials required',
	)
	replace(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Body() dto: QdssDatasetDto,
	) {
		return this.calibration.replace(req.user.sub, groupId, dto);
	}
	@Post('calibrations')
	@HttpCode(200)
	@Response(
		QdssRunResponseDto,
		'Leader runs group GA using custom or current global samples; pin the successful model',
	)
	recalibrate(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Body() dto: QdssRunDto,
	) {
		return this.models.recalibrate(
			req.user.sub,
			groupId,
			dto.expectedInputHash,
		);
	}
	@Get('model')
	@Response(
		QdssModelResponseDto,
		'Active member reads group model state; global dataset updates do not unpin an active model',
	)
	model(@Req() req: Request, @Param('groupId', RuleIdPipe) groupId: number) {
		return this.models.read(req.user.sub, groupId);
	}
	@Get('calibrations/:runId')
	@Response(
		QdssRunResponseDto,
		'Active member reads own-group calibration run metadata',
	)
	run(
		@Req() req: Request,
		@Param('groupId', RuleIdPipe) groupId: number,
		@Param('runId', ParseUUIDPipe) id: string,
	) {
		return this.models.runDetail(req.user.sub, groupId, id);
	}
}
@ApiTags('QDSS shared global samples')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EXPERT')
@Controller('expert/qdss/global')
export class QdssGlobalSamplesController {
	constructor(private readonly calibration: QdssCalibrationService) {}
	@Get('calibration')
	@Response(
		QdssDatasetResponseDto,
		'Read global samples as an active member of a nonarchived group',
	)
	read(@Req() req: Request, @Query() q: QdssPageQuery) {
		return this.calibration.read(req.user.sub, null, q);
	}
}
