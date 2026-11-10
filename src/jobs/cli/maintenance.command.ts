import type { CredentialKeyRotationService } from '../../domain/credentials/credential-key-rotation.service';
import type { CopyReport } from '../../infrastructure/storage/object-migration';

export type MaintenanceCommand = 'storage:migrate' | 'credentials:reencrypt';

export interface MaintenanceDependencies {
	connect: () => Promise<{
		/** Copies .private objects to the configured S3 bucket (never deletes). */
		migrateStorage: (apply: boolean) => Promise<CopyReport>;
		rotation: Pick<CredentialKeyRotationService, 'reencrypt'>;
		/** Runs `work` only while holding the named lease; false when another runner has it. */
		withLease: (
			name: string,
			work: () => Promise<void>,
		) => Promise<boolean>;
		close: () => Promise<void>;
	}>;
	log: (message: string) => void;
	error: (message: string) => void;
}

const HELP: Record<MaintenanceCommand, string> = {
	'storage:migrate':
		'storage:migrate [--dry-run] | --apply | --help. Copies every credential object from CREDENTIAL_STORAGE_ROOT to the S3 bucket and verifies each copy. Never deletes or overwrites. Default: dry run.',
	'credentials:reencrypt':
		'credentials:reencrypt [--dry-run] | --apply | --help. Re-seals credential numbers and documents with the first key of CREDENTIAL_ENCRYPTION_KEYS. Idempotent. Default: dry run.',
};

/** Exit codes: 0 done, 1 failures, 2 usage error, 3 another runner holds the lease. */
export async function runMaintenanceCommand(
	command: string | undefined,
	args: readonly string[],
	deps: MaintenanceDependencies,
): Promise<number> {
	if (command !== 'storage:migrate' && command !== 'credentials:reencrypt') {
		deps.error(
			'Usage: maintenance.cli.js storage:migrate|credentials:reencrypt [--dry-run|--apply|--help]',
		);
		return 2;
	}
	if (
		args.length > 1 ||
		(args[0] && !['--dry-run', '--apply', '--help'].includes(args[0]))
	) {
		deps.error(HELP[command]);
		return 2;
	}
	if (args[0] === '--help') {
		deps.log(HELP[command]);
		return 0;
	}
	const apply = args[0] === '--apply';
	let runtime:
		Awaited<ReturnType<MaintenanceDependencies['connect']>> | undefined;
	try {
		runtime = await deps.connect();
		const tools = runtime;
		let failures = 0;
		const ran = await runtime.withLease(command, async () => {
			const report =
				command === 'storage:migrate'
					? await tools.migrateStorage(apply)
					: await tools.rotation.reencrypt(apply);
			failures =
				report.failed + ('conflicts' in report ? report.conflicts : 0);
			deps.log(JSON.stringify({ command, apply, ...report }));
		});
		if (!ran) {
			deps.error(
				'Another runner is executing this command; try again later',
			);
			return 3;
		}
		return failures > 0 ? 1 : 0;
	} catch {
		// Configuration and provider errors are reported without their details.
		deps.error(
			`${command} failed; check the configuration and connectivity`,
		);
		return 1;
	} finally {
		await runtime?.close().catch(() => deps.error('Cleanup failed'));
	}
}
