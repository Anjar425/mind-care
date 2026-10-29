import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonResponse } from '../common/decorator/api/api-common-response.decorator';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
	constructor(private readonly health: HealthService) {}

	@Get('live')
	@ApiOperation({
		summary: 'Check process availability without contacting dependencies',
	})
	@ApiCommonResponse([200, 429, 500], { model: HealthResponseDto })
	live() {
		return this.health.live();
	}

	@Get('ready')
	@ApiOperation({
		summary:
			'Check database connectivity without disclosing connection details',
	})
	@ApiCommonResponse([200, 429, 503], { model: HealthResponseDto })
	ready() {
		return this.health.ready();
	}
}
