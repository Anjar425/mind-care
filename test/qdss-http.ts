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
import {
	QdssAdminController,
	QdssGroupController,
	QdssGlobalSamplesController,
} from '../src/qdss/qdss.controllers';
import { QdssCalibrationService } from '../src/qdss/qdss-calibration.service';
import { QdssModelService } from '../src/qdss/qdss-model.service';
import { QdssSnapshotService } from '../src/qdss/qdss-snapshot.service';
import { QdssEvaluationService } from '../src/qdss/qdss-evaluation.service';
import { GroupEligibilityService } from '../src/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/expert/expert-profile-completeness.service';
import { ReferenceDataService } from '../src/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/expert-credentials/credential-eligibility.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '../src/common/guards/api-rate-limit.guard';
import { setupApplication } from '../src/common/config/app.setup';
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
