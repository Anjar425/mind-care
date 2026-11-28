// Side-effect module: must be imported before AppModule, whose configuration is validated
// when the module is evaluated.
import { syntheticEnv } from './runtime-config.mock';

Object.assign(process.env, syntheticEnv());
