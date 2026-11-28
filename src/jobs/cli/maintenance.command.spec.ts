import {
	runMaintenanceCommand,
	type MaintenanceDependencies,
} from './maintenance.command';

function deps(overrides: {
	lease?: boolean;
	failed?: number;
	connectError?: boolean;
}) {
	const log = jest.fn();
	const error = jest.fn();
	const close = jest.fn().mockResolvedValue(undefined);
	const reencrypt = jest.fn().mockResolvedValue({
		scanned: 2,
		numbers: 1,
		documents: 1,
		failed: overrides.failed ?? 0,
	});
	const migrateStorage = jest.fn().mockResolvedValue({
		scanned: 1,
		copied: 1,
		present: 0,
		conflicts: 0,
		failed: overrides.failed ?? 0,
	});
	const value: MaintenanceDependencies = {
		log,
		error,
		connect: () =>
			overrides.connectError
				? Promise.reject(new Error('PRIVATE_DATABASE_URL'))
				: Promise.resolve({
						migrateStorage,
						rotation: { reencrypt },
						withLease: async (_name, work) => {
							if (overrides.lease === false) return false;
							await work();
							return true;
						},
						close,
					}),
	};
	return { value, log, error, close, reencrypt, migrateStorage };
}

describe('runMaintenanceCommand', () => {
	it('should reject unknown commands and arguments', async () => {
		const d = deps({});
		expect(await runMaintenanceCommand('drop:all', [], d.value)).toBe(2);
		expect(
			await runMaintenanceCommand(
				'credentials:reencrypt',
				['--force'],
				d.value,
			),
		).toBe(2);
		expect(
			await runMaintenanceCommand('storage:migrate', ['--help'], d.value),
		).toBe(0);
		expect(d.reencrypt).not.toHaveBeenCalled();
	});

	it('should dry-run by default and apply only with --apply', async () => {
		const d = deps({});
		expect(
			await runMaintenanceCommand('credentials:reencrypt', [], d.value),
		).toBe(0);
		expect(d.reencrypt).toHaveBeenLastCalledWith(false);
		await runMaintenanceCommand('storage:migrate', ['--apply'], d.value);
		expect(d.migrateStorage).toHaveBeenLastCalledWith(true);
		expect(
			(d.log.mock.calls.at(-1) as string[] | undefined)?.[0],
		).toContain('"copied":1');
		expect(d.close).toHaveBeenCalledTimes(2);
	});

	it('should exit 3 while another runner holds the lease and 1 on failures', async () => {
		expect(
			await runMaintenanceCommand(
				'credentials:reencrypt',
				['--apply'],
				deps({ lease: false }).value,
			),
		).toBe(3);
		expect(
			await runMaintenanceCommand(
				'credentials:reencrypt',
				['--apply'],
				deps({ failed: 2 }).value,
			),
		).toBe(1);
	});

	it('should report connection problems without their details', async () => {
		const d = deps({ connectError: true });
		expect(
			await runMaintenanceCommand('storage:migrate', [], d.value),
		).toBe(1);
		expect(JSON.stringify(d.error.mock.calls)).not.toContain('PRIVATE');
	});
});
