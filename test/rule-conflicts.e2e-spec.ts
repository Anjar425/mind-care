import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createRulesHttp } from './rules-http';
import { groupHeaders, httpData } from './groups-http';
import { validRuleContent } from './rules-mocks';
import type { RuleDetailDto } from '../src/api/common/dto/rules/rule-responses.dto';
import type { RuleConflictsService } from '../src/domain/rule-conflicts/rule-conflicts.service';
import type { RuleResolutionService } from '../src/domain/rule-conflicts/rule-resolution.service';
type Detail = Awaited<ReturnType<RuleConflictsService['detail']>>;
type Plan = Awaited<ReturnType<RuleResolutionService['create']>>;
describe('Conflict governance HTTP lifecycle (synthetic loopback)', () => {
	let h: Awaited<ReturnType<typeof createRulesHttp>>;
	let groupId: number;
	const base = () => `/api/v1/expert/groups/${groupId}`;
	beforeEach(async () => {
		h = await createRulesHttp(true);
		groupId = h.mocks.groups.seedGroup([1, 2, 3, 4]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	const fixture = async () => {
		await h
			.api()
			.post(`${base()}/dass42-rules`)
			.set(groupHeaders())
			.send(validRuleContent())
			.expect(201);
		const other = validRuleContent();
		other.conclusion.severity = 'MILD';
		const rule = httpData<RuleDetailDto>(
			await h
				.api()
				.post(`${base()}/dass42-rules`)
				.set(groupHeaders(2))
				.send(other)
				.expect(201),
		);
		const caseId = h.mocks.conflicts.state.case[0].id;
		const path = `${base()}/rule-conflicts/${caseId}`;
		const detail = httpData<Detail>(
			await h.api().get(path).set(groupHeaders()).expect(200),
		);
		const payload = {
			expectedCaseStateHash: detail.stateHash,
			reason: 'Review contradictory outcomes',
			actions: [
				{
					ruleId: rule.id,
					expectedRevisionId: detail.members.find(
						(m) => m.ruleId === rule.id,
					)!.revisionId,
					type: 'REVISE',
					content: validRuleContent(),
				},
			],
		};
		return { path, detail, payload, rule };
	};
	it('executes all-author consensus and keeps conflicted rules blocked through the ordinary author API', async () => {
		const f = await fixture();
		await h
			.api()
			.post(`${base()}/dass42-rules/${f.rule.id}/archive`)
			.set(groupHeaders(2))
			.send({
				expectedStateHash: f.rule.stateHash,
				reason: 'Attempt direct archive',
			})
			.expect(409);
		const response = await h
			.api()
			.post(`${f.path}/proposals`)
			.set(groupHeaders())
			.send(f.payload)
			.expect(201);
		expect(response.headers['cache-control']).toBe('no-store');
		const p = httpData<Plan>(response);
		const path = `${f.path}/proposals/${p.id}`;
		await h
			.api()
			.post(`${path}/approve`)
			.set(groupHeaders(3))
			.send({ planDigest: p.planDigest })
			.expect(403);
		expect(
			httpData<Plan>(
				await h
					.api()
					.post(`${path}/approve`)
					.set(groupHeaders(2))
					.send({ planDigest: p.planDigest })
					.expect(200),
			).status,
		).toBe('PENDING');
		expect(
			httpData<Plan>(
				await h
					.api()
					.post(`${path}/approve`)
					.set(groupHeaders())
					.send({ planDigest: p.planDigest })
					.expect(200),
			).status,
		).toBe('APPLIED');
		expect(
			httpData<{ applicableStatus: string }>(
				await h
					.api()
					.get(`${base()}/dass42-rule-assessment`)
					.set(groupHeaders())
					.expect(200),
			).applicableStatus,
		).toBe('CONFLICT_FREE');
		expect(h.mocks.state.revisions).toHaveLength(3);
	});
	it('requires authentication, exact roles, scoped membership and bounded DTOs before workflow operations', async () => {
		await h.api().get(`${base()}/rule-conflicts`).expect(401);
		await h
			.api()
			.get(`${base()}/rule-conflicts`)
			.set('x-test-role', 'ADMIN')
			.expect(403);
		await h
			.api()
			.get(`${base()}/rule-conflicts`)
			.set(groupHeaders(7))
			.expect(403);
		for (const suffix of [
			'?page=0',
			'?limit=101',
			'?status=INVALID',
			'?raw=true',
		])
			await h
				.api()
				.get(`${base()}/rule-conflicts${suffix}`)
				.set(groupHeaders())
				.expect(400);
		await h
			.api()
			.get('/api/v1/expert/groups/0/rule-conflicts')
			.set(groupHeaders())
			.expect(400);
		await h
			.api()
			.get(`${base()}/rule-conflicts/not-uuid`)
			.set(groupHeaders())
			.expect(400);
		const f = await fixture();
		for (const body of [
			{ ...f.payload, participants: [] },
			{ ...f.payload, reason: ' ' },
			{ ...f.payload, actions: [] },
			{
				...f.payload,
				actions: [
					{
						...f.payload.actions[0],
						type: 'ARCHIVE',
						content: validRuleContent(),
					},
				],
			},
		])
			await h
				.api()
				.post(`${f.path}/proposals`)
				.set(groupHeaders())
				.send(body)
				.expect(400);
	});
	it('keeps admin responses minimal and never exposes approval or raw expert-detail grants', async () => {
		const f = await fixture();
		h.mocks.groups.state.experts[6].user.role = 'ADMIN';
		const admin = {
			'x-test-role': 'ADMIN',
			'x-test-user': h.mocks.groups.state.experts[6].userId,
		};
		const r = await h
			.api()
			.get('/api/v1/admin/rule-conflicts')
			.set(admin)
			.expect(200);
		expect(JSON.stringify(r.body)).not.toMatch(
			/premises|normalized|participants|authorExpertId|planDigest/,
		);
		await h
			.api()
			.post(`/api/v1/admin/rule-conflicts/${f.detail.id}/notify`)
			.set(admin)
			.send({})
			.expect(200);
		await h
			.api()
			.post(`/api/v1/admin/rule-conflicts/${f.detail.id}/notify`)
			.set(admin)
			.send({})
			.expect(429);
		await h.api().get(f.path).set(admin).expect(403);
		await h
			.api()
			.post(`/api/v1/admin/rule-conflicts/${f.detail.id}/approve`)
			.set(admin)
			.send({})
			.expect(404);
	});
	it('documents all fourteen guarded routes without engine/public or admin-resolution endpoints', () => {
		const doc = SwaggerModule.createDocument(
			h.app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		const routes = Object.keys(doc.paths).filter(
			(p) =>
				p.includes('rule-conflicts') ||
				p.includes('/expert/notifications') ||
				p.includes('dass42-rule-assessment'),
		);
		expect(routes).toHaveLength(14);
		for (const path of routes)
			for (const operation of Object.values(doc.paths[path]))
				expect(
					(operation as { security: unknown[] }).security.length,
				).toBeGreaterThan(0);
		expect(routes.some((p) => p.includes('/public/'))).toBe(false);
	});
});
