import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createRulesHttp } from '../../../../../test/rules-http';
import { groupHeaders, httpData } from '../../../../../test/groups-http';
import { validRuleContent } from '../../../../../test/rules-mocks';
import type { RuleDetailDto } from '../../../common/dto/rules/rule-responses.dto';

describe('DASS42 rule HTTP boundary', () => {
	let h: Awaited<ReturnType<typeof createRulesHttp>>;
	let groupId: number;
	const path = () => `/expert/groups/${groupId}/dass42-rules`;
	beforeEach(async () => {
		h = await createRulesHttp();
		groupId = h.mocks.groups.seedGroup([1, 2]);
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	it('should require expert authentication before private queries or mutations', async () => {
		await h.api().get(path()).expect(401);
		for (const role of ['ADMIN', 'USER'])
			await h
				.api()
				.post(path())
				.set('x-test-role', role)
				.send(validRuleContent())
				.expect(403);
		expect(h.mocks.transaction).not.toHaveBeenCalled();
	});
	it.each(['groupId', 'authorExpertId', 'compiled', 'isPublished'])(
		'should reject caller-owned extra %s',
		async (key) => {
			await h
				.api()
				.post(path())
				.set(groupHeaders())
				.send({ ...validRuleContent(), [key]: 'injected' })
				.expect(400);
			expect(h.mocks.tx.rule.create).not.toHaveBeenCalled();
		},
	);
	it('should reject nested unknown fields, null conclusions and oversized/invalid grammar through real validation', async () => {
		const c = validRuleContent();
		for (const body of [
			{ ...c, conclusion: null },
			{ ...c, premises: [{ ...c.premises[2], extra: true }] },
			{ ...c, premises: [] },
			{ ...c, premises: [c.premises[0]] },
			{
				...c,
				premises: Array.from({ length: 101 }, () => c.premises[2]),
			},
		])
			await h
				.api()
				.post(path())
				.set(groupHeaders())
				.send(body)
				.expect(400);
	});
	it('should let active members read but reject their author mutations and unsupported query keys', async () => {
		const r = httpData<RuleDetailDto>(
			await h
				.api()
				.post(path())
				.set(groupHeaders())
				.send(validRuleContent())
				.expect(201),
		);
		const response = await h
			.api()
			.get(`${path()}/${r.id}`)
			.set(groupHeaders(2))
			.expect(200);
		expect(response.headers['cache-control']).toBe('no-store');
		await h
			.api()
			.put(`${path()}/${r.id}`)
			.set(groupHeaders(2))
			.send({ ...validRuleContent(), expectedStateHash: r.stateHash })
			.expect(403);
		await h
			.api()
			.get(`${path()}?limit=101`)
			.set(groupHeaders())
			.expect(400);
		await h
			.api()
			.get(`${path()}?includeCredentials=true`)
			.set(groupHeaders())
			.expect(400);
	});
	it('should reject stale forms and keep internal failures generic with whole create rollback', async () => {
		h.mocks.tx.ruleAudit.create.mockRejectedValueOnce(
			new Error('private-database-detail'),
		);
		const response = await h
			.api()
			.post(path())
			.set(groupHeaders())
			.send(validRuleContent())
			.expect(503);
		expect(JSON.stringify(response.body)).not.toContain(
			'private-database-detail',
		);
		expect(h.mocks.state.rules).toHaveLength(0);
		const r = httpData<RuleDetailDto>(
			await h
				.api()
				.post(path())
				.set(groupHeaders())
				.send(validRuleContent())
				.expect(201),
		);
		await h
			.api()
			.put(`${path()}/${r.id}`)
			.set(groupHeaders())
			.send({ ...validRuleContent(), expectedStateHash: '0'.repeat(64) })
			.expect(409);
	});
	it('should document all eight protected routes with typed actual codes and non-clinical readiness boundary', () => {
		const doc = SwaggerModule.createDocument(
			h.app,
			new DocumentBuilder().addBearerAuth().build(),
		);
		const base = '/expert/groups/{groupId}/dass42-rules';
		expect(doc.paths[base].post?.security).toEqual([{ bearer: [] }]);
		expect(doc.paths[base].post?.responses).toHaveProperty('201');
		expect(
			doc.paths[`${base}/{ruleId}/archive`].post?.responses,
		).toHaveProperty('200');
		expect(Object.keys(doc.paths)).toHaveLength(6);
		expect(doc.paths[base].post?.description).toContain(
			'not clinical validation',
		);
		expect(doc.components?.schemas).toHaveProperty('RuleRevisionDetailDto');
	});
	it.each(['0', '-1', '2147483648'])(
		'should reject out-of-range path/version %s before accessing persistence',
		async (id) => {
			await h
				.api()
				.get(`/expert/groups/${id}/dass42-rules`)
				.set(groupHeaders())
				.expect(400);
			await h
				.api()
				.get(`${path()}/1/revisions/${id}`)
				.set(groupHeaders())
				.expect(400);
			expect(h.mocks.transaction).not.toHaveBeenCalled();
		},
	);
});
