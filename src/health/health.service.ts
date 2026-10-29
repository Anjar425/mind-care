import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';
import { ConfigService } from '@nestjs/config';
import type { RuntimeEnvironment } from '../common/config/environment.config';

@Injectable()
export class HealthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly indicators: HealthIndicatorService,
		private readonly health: HealthCheckService,
		private readonly config: ConfigService<RuntimeEnvironment, true>,
	) {}

	live(): HealthResponseDto {
		return { status: 'ok' };
	}

	async ready(): Promise<HealthResponseDto> {
		try {
			await this.health.check([() => this.database()]);
			return { status: 'ok' };
		} catch {
			throw new ServiceUnavailableException('Service unavailable');
		}
	}

	private async database() {
		const check = this.indicators.check('database');
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				this.prisma.$queryRaw`SELECT 1`,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error('Readiness timeout')),
						this.config.get('HEALTH_CHECK_TIMEOUT_MS', {
							infer: true,
						}),
					);
				}),
			]);
			return check.up();
		} catch {
			return check.down();
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}
