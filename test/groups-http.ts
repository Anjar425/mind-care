import {
	ExecutionContext,
	INestApplication,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import type { Server } from 'node:http';
import request from 'supertest';
import { GroupsController } from '../src/api/expert/groups/groups.controller';
import { GroupInvitationsController } from '../src/api/expert/groups/group-invitations.controller';
import { GroupLeadershipController } from '../src/api/expert/groups/group-leadership.controller';
import { PublicGroupsController } from '../src/api/public/groups/public-groups.controller';
import { GroupsService } from '../src/domain/groups/groups.service';
import { GroupEligibilityService } from '../src/domain/groups/group-eligibility.service';
import { ExpertProfileCompletenessService } from '../src/domain/expert/expert-profile-completeness.service';
import { CredentialEligibilityService } from '../src/domain/credentials/credential-eligibility.service';
import { ReferenceDataService } from '../src/domain/reference-data/reference-data.service';
import { JwtAuthGuard } from '../src/api/common/auth/jwt-auth.guard';
import { RolesGuard } from '../src/api/common/auth/roles.guard';
import { ApiRateLimitGuard } from '../src/api/common/rate-limit/api-rate-limit.guard';
import { ResponseInterceptor } from '../src/api/common/interceptors/response.interceptor';
import { setupApplication } from '../src/api/app.setup';
import { runtimeConfigProvider, syntheticConfig } from './runtime-config.mock';
import { createGroupsMocks, groupUserId } from './groups-mocks';

export async function createGroupsHttp() {
	const mocks = createGroupsMocks();
	const errors = jest
		.spyOn(Logger.prototype, 'error')
		.mockImplementation(() => undefined);
	const module = await Test.createTestingModule({
		imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
		controllers: [
			GroupsController,
			GroupInvitationsController,
			GroupLeadershipController,
			PublicGroupsController,
		],
		providers: [
			GroupsService,
			GroupEligibilityService,
			CredentialEligibilityService,
			ReferenceDataService,
			ExpertProfileCompletenessService,
			RolesGuard,
			runtimeConfigProvider,
			ResponseInterceptor,
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
export const groupHeaders = (n = 1) => ({
	'x-test-role': 'EXPERT',
	'x-test-user': groupUserId(n),
});
export const httpData = <T>(r: { body: unknown }) =>
	(r.body as { data: T }).data;
