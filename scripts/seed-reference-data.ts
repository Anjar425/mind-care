import { Logger } from '@nestjs/common';
import { runReferenceSeed } from '../src/reference-data/reference-seed.cli';

const logger = new Logger('ReferenceSeed');
runReferenceSeed(process.argv.slice(2), {
	connect: async () => {
		const { createReferenceSeedRuntime } =
			await import('../src/reference-data/reference-seed.runtime.js');
		return createReferenceSeedRuntime();
	},
	log: (message) => logger.log(message),
	error: (message) => logger.error(message),
})
	.then((code) => {
		process.exitCode = code;
	})
	.catch(() => {
		logger.error('Reference seeder failed');
		process.exitCode = 1;
	});
