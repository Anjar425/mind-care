import {
	ExecutionContext,
	INestApplication,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Server } from 'node:http';
import request from 'supertest';
import { QdssAdminController } from '../src/api/admin/qdss-global/qdss-admin.controller';
import { QdssGroupController } from '../src/api/expert/groups/qdss/qdss-group.controller';
import { QdssGlobalSamplesController } from '../src/api/expert/qdss-global/qdss-global-samples.controller';
import { QdssCalibrationService } from '../src/domain/qdss/qdss-calibration.service';
import { QdssModelService } from '../src/domain/qdss/qdss-model.service';
import { QdssSnapshotService } from '../src/domain/qdss/qdss-snapshot.service';
import { QdssEvaluationService } from '../src/domain/qdss/qdss-evaluation.service';
import { GroupEligibilityService } from '../src/domain/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/domain/expert/expert-profile-completeness.service';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/domain/credentials/credential-eligibility.service';
import { JwtAuthGuard } from '../src/api/common/auth/jwt-auth.guard';
import { RolesGuard } from '../src/api/common/auth/roles.guard';
import { ResponseInterceptor } from '../src/api/common/interceptors/response.interceptor';
import { ApiRateLimitGuard } from '../src/api/common/rate-limit/api-rate-limit.guard';
import { setupApplication } from '../src/api/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import { createQdssMocks } from './qdss-mocks';
import { groupUserId } from './groups-mocks';
export async function createQdssHttp() {
	type TestRequest = {
		headers: Record<string, string>;
		user?: { sub: string; role: string };
	};
	const mocks = createQdssMocks();
	const errors = jest
		.spyOn(Logger.prototype, 'error')
		.mockImplementation(() => undefined);
	const module = await Test.createTestingModule({
		imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
		controllers: [
			QdssAdminController,
			QdssGroupController,
			QdssGlobalSamplesController,
		],
		providers: [
			QdssCalibrationService,
			QdssModelService,
			QdssSnapshotService,
			QdssEvaluationService,
			GroupEligibilityService,
			ExpertProfileCompletenessService,
			ReferenceDataService,
			CredentialEligibilityService,
			RolesGuard,
			ResponseInterceptor,
			runtimeConfigProvider,
			mocks.provider,
			{ provide: APP_GUARD, useClass: ApiRateLimitGuard },
		],
	})
		.overrideGuard(JwtAuthGuard)
		.useValue({
			canActivate: (context: ExecutionContext) => {
				const req = context.switchToHttp().getRequest<TestRequest>();
				const role = req.headers['x-test-role'];
				if (!role) throw new UnauthorizedException();
				req.user = {
					sub: req.headers['x-test-user'] ?? groupUserId(1),
					role,
				};
				return true;
			},
		})
		.compile();
	const app = module.createNestApplication<INestApplication<Server>>({
		logger: false,
	});
	setupApplication(app, syntheticConfig);
	await app.init();
	await app.listen(0, '127.0.0.1');
	return {
		app,
		mocks,
		api: () => request(app.getHttpServer()),
		close: async () => {
			await app.close();
			errors.mockRestore();
		},
	};
}
