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
import { RulesController } from '../src/rules/rules.controller';
import { RulesService } from '../src/rules/rules.service';
import { RuleRevisionStore } from '../src/rules/rule-revision-store.service';
import { RuleConflictCoreService } from '../src/rule-conflicts/rule-conflict-core.service';
import { RuleResolutionService } from '../src/rule-conflicts/rule-resolution.service';
import { RuleConflictsService } from '../src/rule-conflicts/rule-conflicts.service';
import { Dass42RuleAssessmentService } from '../src/rule-conflicts/dass42-rule-assessment.service';
import {
	RuleConflictsController,
	ConflictNotificationsController,
	AdminRuleConflictsController,
} from '../src/rule-conflicts/rule-conflicts.controller';
import { GroupEligibilityService } from '../src/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/expert/expert-profile-completeness.service';
import { RuleReferenceService } from '../src/rules/rule-reference.service';
import { ReferenceDataService } from '../src/reference-data/reference-data.service';
import { CredentialEligibilityService } from '../src/expert-credentials/credential-eligibility.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptor/response/response.interceptor';
import { ApiRateLimitGuard } from '../src/common/guards/api-rate-limit.guard';
import { setupApplication } from '../src/common/config/app.setup';
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
