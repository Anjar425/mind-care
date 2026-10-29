import { runReferenceSeed } from './reference-seed.cli';
import {
	ReferenceSeedError,
	type ReferenceSeedReport,
} from './reference-seed.types';

describe('Reference seeder CLI', () => {
	const report: ReferenceSeedReport = {
		mode: 'preview',
		catalogVersion: 'prototype-candidate-v1',
		catalogDigest: 'a'.repeat(64),
		canApply: true,
		inserted: 0,
		conflicts: [],
		collections: {
			DASS21: { expected: 21, insert: 21, unchanged: 0 },
			DASS42: { expected: 42, insert: 42, unchanged: 0 },
			Conclusion: { expected: 15, insert: 15, unchanged: 0 },
		},
	};
	const run = jest.fn<Promise<ReferenceSeedReport>, [boolean]>();
	const close = jest.fn<Promise<void>, []>();
	const connect = jest.fn();
	const log = jest.fn<void, [string]>();
	const error = jest.fn<void, [string]>();
	const deps = { connect, log, error };
	beforeEach(() => {
		run.mockReset().mockResolvedValue(report);
		close.mockReset().mockResolvedValue(undefined);
		connect.mockReset().mockResolvedValue({ service: { run }, close });
	});
	afterEach(() => jest.clearAllMocks());
	it.each([{ args: [] }, { args: ['--dry-run'] }])(
		'should preview without writing when arguments are %p',
		async ({ args }) => {
			expect(await runReferenceSeed(args, deps)).toBe(0);
			expect(run).toHaveBeenCalledWith(false);
			expect(close).toHaveBeenCalledTimes(1);
		},
	);
	it('should request apply only when the explicit apply option is supplied', async () => {
		expect(await runReferenceSeed(['--apply'], deps)).toBe(0);
		expect(run).toHaveBeenCalledWith(true);
	});
	it('should show the catalog without connecting when catalog-only is selected', async () => {
		expect(await runReferenceSeed(['--catalog-only'], deps)).toBe(0);
		expect(connect).not.toHaveBeenCalled();
		const output = JSON.parse(log.mock.calls[0][0]) as {
			storageChecked: boolean;
			expected: {
				DASS21: string[];
				DASS42: string[];
				Conclusion: number;
			};
		};
		expect(output.storageChecked).toBe(false);
		expect(output.expected.DASS21).toHaveLength(21);
		expect(output.expected.DASS42).toHaveLength(42);
		expect(output.expected.Conclusion).toBe(15);
	});
	it('should show help without connecting when help is requested', async () => {
		expect(await runReferenceSeed(['--help'], deps)).toBe(0);
		expect(connect).not.toHaveBeenCalled();
	});
	it.each([
		{ args: ['--unknown'] },
		{ args: ['--apply', '--dry-run'] },
		{ args: ['--apply=1'] },
		{ args: ['--apply', '--force'] },
	])(
		'should reject ambiguous or unknown flags when arguments are %p',
		async ({ args }) => {
			expect(await runReferenceSeed(args, deps)).toBe(2);
			expect(connect).not.toHaveBeenCalled();
		},
	);
	it('should return a blocked exit code when preview reports conflicts', async () => {
		run.mockResolvedValue({ ...report, canApply: false });
		expect(await runReferenceSeed([], deps)).toBe(2);
		expect(close).toHaveBeenCalledTimes(1);
	});
	it('should close the runtime and redact errors when a provider fails', async () => {
		run.mockRejectedValue(new Error('PRIVATE_CONNECTION_VALUE'));
		expect(await runReferenceSeed(['--apply'], deps)).toBe(1);
		expect(close).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(error.mock.calls)).not.toContain(
			'PRIVATE_CONNECTION_VALUE',
		);
	});
	it('should print only controlled conflict information when apply is rejected', async () => {
		run.mockRejectedValue(
			new ReferenceSeedError('CONFLICT', 'Existing catalog differs', {
				...report,
				canApply: false,
			}),
		);
		expect(await runReferenceSeed(['--apply'], deps)).toBe(1);
		expect(log).toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(
			'CONFLICT: Existing catalog differs',
		);
	});
	it('should report cleanup failure when disconnect rejects', async () => {
		close.mockRejectedValue(new Error('PRIVATE_DISCONNECT_VALUE'));
		expect(await runReferenceSeed([], deps)).toBe(1);
		expect(error).toHaveBeenCalledWith('Seeder cleanup failed');
		expect(JSON.stringify(error.mock.calls)).not.toContain(
			'PRIVATE_DISCONNECT_VALUE',
		);
	});
	it('should redact initialization failures when connection creation rejects', async () => {
		connect.mockRejectedValue(new Error('PRIVATE_CONNECTION_VALUE'));
		expect(await runReferenceSeed([], deps)).toBe(1);
		expect(close).not.toHaveBeenCalled();
		expect(JSON.stringify(error.mock.calls)).not.toContain(
			'PRIVATE_CONNECTION_VALUE',
		);
	});
});
