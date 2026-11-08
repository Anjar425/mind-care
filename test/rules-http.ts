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
import { RulesController } from '../src/api/expert/groups/rules/rules.controller';
import { RulesService } from '../src/domain/rules/rules.service';
import { RuleRevisionStore } from '../src/domain/rules/rule-revision-store.service';
import { RuleConflictCoreService } from '../src/domain/rules/conflicts/rule-conflict-core.service';
import { RuleResolutionService } from '../src/domain/rule-conflicts/rule-resolution.service';
import { RuleConflictsService } from '../src/domain/rule-conflicts/rule-conflicts.service';
import { Dass42RuleAssessmentService } from '../src/domain/rules/conflicts/dass42-rule-assessment.service';
import { RuleConflictsController } from '../src/api/expert/groups/rule-conflicts/rule-conflicts.controller';
import { ConflictNotificationsController } from '../src/api/expert/notifications/conflict-notifications.controller';
import { AdminRuleConflictsController } from '../src/api/admin/rule-conflicts/admin-rule-conflicts.controller';
import { GroupEligibilityService } from '../src/domain/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/domain/expert/expert-profile-completeness.service';
import { RuleReferenceService } from '../src/domain/rules/rule-reference.service';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/domain/credentials/credential-eligibility.service';
import { JwtAuthGuard } from '../src/api/common/auth/jwt-auth.guard';
import { RolesGuard } from '../src/api/common/auth/roles.guard';
import { ResponseInterceptor } from '../src/api/common/interceptors/response.interceptor';
import { ApiRateLimitGuard } from '../src/api/common/rate-limit/api-rate-limit.guard';
import { setupApplication } from '../src/api/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import { createRulesMocks } from './rules-mocks';
import { groupUserId } from './groups-mocks';

export async function createRulesHttp(includeConflicts = false) {
	const mocks = createRulesMocks();
	const errors = jest
		.spyOn(Logger.prototype, 'error')
		.mockImplementation(() => undefined);
	const module = await Test.createTestingModule({
		imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
		controllers: [
			RulesController,
			...(includeConflicts
				? [
						RuleConflictsController,
						ConflictNotificationsController,
						AdminRuleConflictsController,
					]
				: []),
		],
		providers: [
			RulesService,
			RuleRevisionStore,
			RuleConflictCoreService,
			RuleResolutionService,
			RuleConflictsService,
			Dass42RuleAssessmentService,
			GroupEligibilityService,
			ExpertProfileCompletenessService,
			RuleReferenceService,
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
				const http = context.switchToHttp();
				const req = http.getRequest<{
					headers: Record<string, string>;
					user?: { sub: string; role: string };
				}>();
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
