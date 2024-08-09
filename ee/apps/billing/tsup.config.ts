import { config } from '../../../build/tsup.config';
import { defineConfig } from 'tsup';
// @ts-expect-error, don't care about this error
export default defineConfig({ ...config, entry: ['app.ts'] });
