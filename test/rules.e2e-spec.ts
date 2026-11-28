import { createRulesHttp } from './rules-http';
import { groupHeaders, httpData } from './groups-http';
import { validRuleContent } from './rules-mocks';
import type {
	RuleDetailDto,
	RuleRevisionDetailDto,
	RuleRevisionsPageDto,
	RulesPageDto,
} from '../src/api/common/dto/rules/rule-responses.dto';
describe('DASS42 authoring lifecycle HTTP integration', () => {
	let h: Awaited<ReturnType<typeof createRulesHttp>>;
	beforeEach(async () => {
		h = await createRulesHttp();
	});
	afterEach(async () => {
		await h?.close();
		jest.clearAllMocks();
	});
	it('should preserve revisions through collaborate/revise/history/archive and own post-removal read without changing group timestamps', async () => {
		const id = h.mocks.groups.seedGroup([1, 2]);
		const base = `/api/v1/expert/groups/${id}/dass42-rules`;
		const before = structuredClone(h.mocks.groups.state.groups);
		let r = httpData<RuleDetailDto>(
			await h
				.api()
				.post(base)
				.set(groupHeaders())
				.send(validRuleContent())
				.expect(201),
		);
		await h.api().get(`${base}/${r.id}`).set(groupHeaders(2)).expect(200);
		const c = validRuleContent();
		c.conclusion.severity = 'SEVERE';
		r = httpData<RuleDetailDto>(
			await h
				.api()
				.put(`${base}/${r.id}`)
				.set(groupHeaders())
				.send({ ...c, expectedStateHash: r.stateHash })
				.expect(200),
		);
		expect(r.version).toBe(2);
		const old = httpData<RuleRevisionDetailDto>(
			await h
				.api()
				.get(`${base}/${r.id}/revisions/1`)
				.set(groupHeaders())
				.expect(200),
		);
		expect(old.content).toEqual(validRuleContent());
		expect(old).not.toHaveProperty('stateHash');
		const history = httpData<RuleRevisionsPageDto>(
			await h
				.api()
				.get(`${base}/${r.id}/revisions`)
				.set(groupHeaders())
				.expect(200),
		);
		expect(history.items.map((v) => v.version)).toEqual([2, 1]);
		await h
			.api()
			.post(`${base}/${r.id}/archive`)
			.set(groupHeaders())
			.send({
				expectedStateHash: r.stateHash,
				reason: 'Professional withdrawal',
			})
			.expect(200);
		expect(
			httpData<RulesPageDto>(
				await h.api().get(base).set(groupHeaders()).expect(200),
			).items,
		).toHaveLength(0);
		expect(
			httpData<RulesPageDto>(
				await h
					.api()
					.get('/api/v1/expert/dass42-rules?lifecycle=all')
					.set(groupHeaders())
					.expect(200),
			).items,
		).toHaveLength(1);
		h.mocks.groups.state.memberships[0].status = 'REMOVED';
		await h.api().get(`${base}/${r.id}`).set(groupHeaders()).expect(200);
		await h.api().get(`${base}/${r.id}`).set(groupHeaders(3)).expect(403);
		expect(h.mocks.groups.state.groups).toEqual(before);
		expect(h.mocks.state.revisions).toHaveLength(2);
		expect(h.mocks.state.audits.map((a) => a.action)).toEqual([
			'CREATED',
			'REVISED',
			'ARCHIVED',
		]);
	});
});
