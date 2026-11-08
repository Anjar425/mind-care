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
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import type { AccessPrincipal } from '../../../../domain/identity/identity.types';
import { PositiveIntIdPipe } from '../../../common/pipes/positive-int-id.pipe';
import { QdssCalibrationService } from '../../../../domain/qdss/qdss-calibration.service';
import { QdssModelService } from '../../../../domain/qdss/qdss-model.service';
import {
	QdssDatasetDto,
	QdssPageQuery,
	QdssRunDto,
} from '../../../common/dto/qdss/qdss.requests.dto';
import {
	QdssDatasetResponseDto,
	QdssDatasetSavedDto,
	QdssModelResponseDto,
	QdssRunResponseDto,
} from '../../../common/dto/qdss/qdss.responses.dto';
import { QdssResponse } from '../../../common/dto/qdss/qdss-api.decorator';
type Request = { user: AccessPrincipal };
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
	@QdssResponse(
		QdssDatasetResponseDto,
		'Read own-group or inherited global samples as a current active member',
	)
	read(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Query() q: QdssPageQuery,
	) {
		return this.calibration.read(req.user.sub, groupId, q);
	}
	@Put('calibration')
	@QdssResponse(
		QdssDatasetSavedDto,
		'Leader replaces own-group dataset; current valid credentials required',
	)
	replace(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Body() dto: QdssDatasetDto,
	) {
		return this.calibration.replace(req.user.sub, groupId, dto);
	}
	@Post('calibrations')
	@HttpCode(200)
	@QdssResponse(
		QdssRunResponseDto,
		'Leader runs group GA using custom or current global samples; pin the successful model',
	)
	recalibrate(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Body() dto: QdssRunDto,
	) {
		return this.models.recalibrate(
			req.user.sub,
			groupId,
			dto.expectedInputHash,
		);
	}
	@Get('model')
	@QdssResponse(
		QdssModelResponseDto,
		'Active member reads group model state; global dataset updates do not unpin an active model',
	)
	model(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
	) {
		return this.models.read(req.user.sub, groupId);
	}
	@Get('calibrations/:runId')
	@QdssResponse(
		QdssRunResponseDto,
		'Active member reads own-group calibration run metadata',
	)
	run(
		@Req() req: Request,
		@Param('groupId', PositiveIntIdPipe) groupId: number,
		@Param('runId', ParseUUIDPipe) id: string,
	) {
		return this.models.runDetail(req.user.sub, groupId, id);
	}
}
