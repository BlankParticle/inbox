/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(
  readFileSync('./package.json', { encoding: 'utf8' })
);

export const config = defineConfig({
  entry: ['app.ts', 'tracing.ts'],
  outDir: '.output',
  format: 'esm',
  target: 'esnext',
  clean: true,
  bundle: true,
  noExternal: Object.keys(packageJson.devDependencies),
  minify: false,
  keepNames: true,
  banner: {
    js: [
      `import { createRequire as createRequire__ } from 'module';`,
      `const require = createRequire__(import.meta.url);`
    ].join('\n')
  },
  esbuildOptions: (options) => {
    options.legalComments = 'none';
  }
});
