import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';

const copyPackageJsonPerDir = async (dir: string, name: string) => {
  const packageJson = (await glob(`./${dir}/*/package.json`)).sort();
  return [`# ${name}`].concat(
    packageJson.map((path) => `COPY /${path} ./${path}`)
  );
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const runWithCache = (command: string, cacheId: string, mount: string) =>
  // don't have support for cache yet
  // `RUN --mount=type=cache,id=${cacheId},target=${mount} ${command}`;
  `RUN ${command}`;

const isolateModules = (app: string, target: string) =>
  runWithCache(
    `pnpm deploy --prod --frozen-lockfile --ignore-scripts --filter=${app} /modules/${target}`,
    'pnpm',
    '/pnpm/store'
  );

const createNextStandalone = (layer: string, app: string) => [
  `# Create ${layer} container`,
  `FROM base AS ${layer}`,
  `WORKDIR /uninbox`,
  `COPY --from=pnpm-cache /uninbox/${app}/package.json .`,
  `COPY --from=builder /uninbox/${app}/.next/standalone .next/standalone`,
  `ENV HOSTNAME=0.0.0.0`,
  `CMD node .next/standalone/${app}/server.js`
];

const createAppContainer = (layer: string, app: string, trace = true) => [
  `# Create ${layer} container`,
  `FROM base AS ${layer}`,
  `WORKDIR /uninbox`,
  `COPY --from=isolated_modules /modules/${layer} .`,
  `COPY --from=builder /uninbox/${app}/.output .output`,
  `CMD node ${trace ? '--import ./.output/tracing.js ' : ''}.output/app.js`
];

const generateDockerfile = async () => {
  const dockerfile: string[][] = [];

  // Setup Base Image
  const nodeVersion = (await readFile(`.nvmrc`, 'utf-8')).slice(1).trim();
  dockerfile.push([
    `# Base Image`,
    `FROM node:${nodeVersion}-slim AS base`,
    `WORKDIR /uninbox`
  ]);

  // Pnpm Cache
  dockerfile.push([
    `# Pnpm Cache`,
    `FROM base AS pnpm-cache`,
    `ENV PNPM_HOME="/pnpm"`,
    `ENV PATH="$PNPM_HOME:$PATH"`,
    `ENV NEXT_TELEMETRY_DISABLED=1`,
    `ENV TURBO_TELEMETRY_DISABLED=1`,
    `RUN corepack enable`
  ]);

  // Copy Root
  dockerfile.push([
    `# Root`,
    `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./`
  ]);

  // Add package.json files
  dockerfile.push(await copyPackageJsonPerDir('packages', 'Packages'));
  dockerfile.push(await copyPackageJsonPerDir('apps', 'Apps'));
  dockerfile.push(await copyPackageJsonPerDir('ee/apps', 'EE Apps'));

  // Install Dependencies
  dockerfile.push([
    `# Install dependencies`,
    runWithCache(
      'pnpm install --frozen-lockfile --prefer-offline --ignore-scripts',
      'pnpm',
      '/pnpm/store'
    )
  ]);

  // Distribute UnBundled Modules
  dockerfile.push([
    `# Distribute UnBundled Modules`,
    `FROM pnpm-cache AS isolated_modules`,
    isolateModules('@u22n/platform', 'platform'),
    isolateModules('@u22n/mail-bridge', 'mail-bridge'),
    isolateModules('@u22n/storage', 'storage'),
    isolateModules('@u22n/worker', 'worker'),
    isolateModules('@uninbox-ee/billing', 'ee-billing')
  ]);

  // Build Everything
  dockerfile.push([
    `# Build everything`,
    `FROM pnpm-cache AS builder`,
    `ENV DOCKER_BUILD=1`,
    `COPY . .`,
    runWithCache('pnpm run build:all', 'turbo', './.turbo'),
    runWithCache('pnpm run ee:build:all', 'turbo', './.turbo'),
    `RUN rm -rf ./**/.turbo`
  ]);

  // Create App Containers
  dockerfile.push(createNextStandalone('web', 'apps/web'));
  dockerfile.push(createAppContainer('platform', 'apps/platform'));
  dockerfile.push(createAppContainer('mail-bridge', 'apps/mail-bridge'));
  dockerfile.push(createAppContainer('storage', 'apps/storage'));
  dockerfile.push(createAppContainer('worker', 'apps/worker'));
  dockerfile.push(createNextStandalone('ee-command', 'ee/apps/command'));
  dockerfile.push(createAppContainer('ee-billing', 'ee/apps/billing', false));

  // Write to file
  await writeFile(
    './Dockerfile',
    dockerfile.map((line) => line.join('\n')).join('\n\n')
  );
};

void generateDockerfile();
