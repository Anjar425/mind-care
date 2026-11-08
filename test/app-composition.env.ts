// Side-effect module: must be imported before AppModule, whose configuration is validated
// when the module is evaluated.
import { syntheticConfig } from './runtime-config.mock';

for (const [key, value] of Object.entries(syntheticConfig))
	process.env[key] = String(value);
