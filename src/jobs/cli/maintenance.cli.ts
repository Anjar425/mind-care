// Operator commands, run from the project root (or /app in the runtime image):
//   node dist/jobs/cli/maintenance.cli.js storage:migrate [--dry-run|--apply]
//   node dist/jobs/cli/maintenance.cli.js credentials:reencrypt [--dry-run|--apply]
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CredentialKeyRotationService } from '../../domain/credentials/credential-key-rotation.service';
import { CredentialsModule } from '../../domain/credentials/credentials.module';
import type { RuntimeEnvironment } from '../../infrastructure/config/environment.config';
import { RuntimeConfigModule } from '../../infrastructure/config/runtime-config.module';
import { JobLeaseService } from '../../infrastructure/prisma/job-lease.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { LocalObjectStore } from '../../infrastructure/storage/local-object.store';
import { copyObjects } from '../../infrastructure/storage/object-migration';
import {
	createObjectStore,
	storageSettings,
} from '../../infrastructure/storage/storage.module';
import { runMaintenanceCommand } from './maintenance.command';

const LEASE_MS = 60 * 60 * 1000;

@Module({
	imports: [RuntimeConfigModule, PrismaModule, CredentialsModule],
	providers: [JobLeaseService],
})
class MaintenanceCliModule {}

async function main(): Promise<number> {
	const [command, ...args] = process.argv.slice(2);
	return runMaintenanceCommand(command, args, {
		log: (message) => process.stdout.write(`${message}\n`),
		error: (message) => process.stderr.write(`${message}\n`),
		connect: async () => {
			const app = await NestFactory.createApplicationContext(
				MaintenanceCliModule,
				{ logger: false },
			);
			const config = app.get(ConfigService<RuntimeEnvironment, true>);
			const leases = app.get(JobLeaseService);
			return {
				migrateStorage: (apply) => {
					const settings = storageSettings(config);
					if (!settings.S3_BUCKET)
						throw new Error('S3_BUCKET is not configured');
					return copyObjects(
						new LocalObjectStore(settings.CREDENTIAL_STORAGE_ROOT),
						createObjectStore({
							...settings,
							STORAGE_DRIVER: 's3',
						}),
						apply,
					);
				},
				rotation: app.get(CredentialKeyRotationService),
				withLease: (name, work) => leases.run(name, LEASE_MS, work),
				close: () => app.close(),
			};
		},
	});
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch(() => {
		process.stderr.write('Maintenance command failed\n');
		process.exitCode = 1;
	});
