import { getReferenceSeedManifest } from './reference-seed.plan';
import { ReferenceSeedError } from './reference-seed.types';
import type { ReferenceSeedService } from './reference-seed.service';

interface SeedDependencies {
	connect: () => Promise<{
		service: Pick<ReferenceSeedService, 'run'>;
		close: () => Promise<void>;
	}>;
	log: (message: string) => void;
	error: (message: string) => void;
}

const HELP =
	'Reference seeder: [--dry-run] | --apply | --catalog-only | --help. Default: database preview without writes. Run from the project root. Production seeding is disabled.';

export async function runReferenceSeed(
	args: readonly string[],
	deps: SeedDependencies,
): Promise<number> {
	if (
		args.length > 1 ||
		(args.length === 1 &&
			!['--dry-run', '--apply', '--catalog-only', '--help'].includes(
				args[0],
			))
	) {
		deps.error(HELP);
		return 2;
	}
	if (args[0] === '--help') {
		deps.log(HELP);
		return 0;
	}
	let runtime: Awaited<ReturnType<SeedDependencies['connect']>> | undefined;
	let exitCode = 0;
	try {
		if (args[0] === '--catalog-only') {
			deps.log(JSON.stringify(getReferenceSeedManifest()));
			return 0;
		}
		// Validate the known release before loading environment settings or connecting.
		getReferenceSeedManifest();
		runtime = await deps.connect();
		const report = await runtime.service.run(args[0] === '--apply');
		deps.log(JSON.stringify(report));
		if (!report.canApply) exitCode = 2;
	} catch (error: unknown) {
		if (error instanceof ReferenceSeedError) {
			if (error.report) deps.log(JSON.stringify(error.report));
			deps.error(`${error.code}: ${error.message}`);
		} else deps.error('Seeder failed; no provider details are exposed');
		exitCode = 1;
	} finally {
		if (runtime) {
			try {
				await runtime.close();
			} catch {
				deps.error('Seeder cleanup failed');
				exitCode = 1;
			}
		}
	}
	return exitCode;
}
